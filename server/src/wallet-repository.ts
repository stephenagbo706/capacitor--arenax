import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { Pool, PoolClient } from 'pg';
import { HttpError } from './http-errors';

const scrypt = promisify(scryptCallback);
const PIN_MAX_FAILED_ATTEMPTS = Number(process.env['PIN_MAX_FAILED_ATTEMPTS'] || 5);
const PIN_LOCKOUT_MINUTES = Number(process.env['PIN_LOCKOUT_MINUTES'] || 15);
const DEFAULT_WALLET_BALANCE = Number(process.env['DEFAULT_WALLET_BALANCE'] || 0);

type Currency = 'NGN' | 'USD';
type WalletTransactionStatus = 'pending' | 'completed' | 'failed' | 'processed';
type WalletTransactionType = 'deposit' | 'withdraw' | 'reward' | 'stake_lock' | 'entry_lock' | 'tournament_entry_fee' | 'refund';

interface WalletRow {
  user_id: string;
  balance: string;
  locked_balance: string;
  currency: Currency;
  status: 'active' | 'restricted' | 'suspended';
}

interface WalletTransactionRow {
  id: string;
  user_id: string;
  type: WalletTransactionType;
  amount: string;
  currency: Currency;
  method: string | null;
  destination: string | null;
  reference_id: string;
  status: WalletTransactionStatus;
  idempotency_key: string;
  note: string | null;
  details: string | null;
  created_at: Date;
}

export interface WalletAuthorization {
  type: 'pin' | 'biometric';
  pin?: string;
  biometricAssertionId?: string;
}

export interface WithdrawalInput {
  amount: number;
  currency: Currency;
  method: string;
  destination: string;
  idempotencyKey: string;
  authorization: WalletAuthorization;
}

export class WalletRepository {
  constructor(private readonly db: Pool) {}

  async getSecurity(userId: string) {
    await this.ensureWallet(userId);
    const result = await this.db.query<{ has_pin: boolean; locked_until: Date | null }>(
      `
      SELECT true AS has_pin, locked_until
      FROM wallet_transaction_pins
      WHERE user_id = $1
      `,
      [userId]
    );
    const row = result.rows[0];
    return {
      hasTransactionPin: Boolean(row?.has_pin),
      pinLockedUntil: row?.locked_until?.toISOString(),
      biometricAvailable: false,
    };
  }

  async setTransactionPin(userId: string, pin: string) {
    this.assertPin(pin);
    await this.ensureWallet(userId);
    const pinHash = await this.hashPin(pin);
    await this.db.query(
      `
      INSERT INTO wallet_transaction_pins (user_id, pin_hash)
      VALUES ($1, $2)
      ON CONFLICT (user_id)
      DO UPDATE SET pin_hash = EXCLUDED.pin_hash, failed_attempts = 0, locked_until = NULL, updated_at = now()
      `,
      [userId, pinHash]
    );
    await this.audit(userId, 'transaction_pin_updated');
    return this.getSecurity(userId);
  }

  async getWallet(userId: string) {
    const wallet = await this.ensureWallet(userId);
    const transactions = await this.db.query<WalletTransactionRow>(
      `
      SELECT *
      FROM wallet_transactions
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 50
      `,
      [userId]
    );
    return { wallet: this.toWalletDto(wallet), transactions: transactions.rows.map((row) => this.toTransactionDto(row)) };
  }

  async createDeposit(userId: string, input: { amount: number; currency: Currency; method: string; idempotencyKey: string }) {
    this.assertAmount(input.amount, 100, 500000, 'deposit');
    const method = this.cleanText(input.method, 80, 'Payment method is required.');
    const idempotencyKey = this.cleanText(input.idempotencyKey, 160, 'Idempotency key is required.');

    return this.withTransaction(async (client) => {
      await this.ensureWallet(userId, client);
      const existing = await this.findTransactionByIdempotency(client, userId, idempotencyKey);
      if (existing) return this.transactionResponse(client, userId, existing);

      const wallet = await this.lockWallet(client, userId);
      const nextBalance = Number(wallet.balance) + input.amount;
      const updatedWallet = await this.updateWalletBalance(client, userId, nextBalance);
      const transaction = await this.insertTransaction(client, userId, {
        type: 'deposit',
        amount: input.amount,
        currency: input.currency,
        method,
        destination: null,
        referenceId: this.reference('DEP'),
        status: 'completed',
        idempotencyKey,
        note: 'Wallet deposit completed.',
        details: method,
      });
      await this.audit(userId, 'deposit_completed', transaction.reference_id, { amount: input.amount, currency: input.currency }, client);
      return { referenceId: transaction.reference_id, status: transaction.status, wallet: this.toWalletDto(updatedWallet), transaction: this.toTransactionDto(transaction) };
    });
  }

  async requestWithdrawal(userId: string, input: WithdrawalInput) {
    this.assertAmount(input.amount, 500, 200000, 'withdrawal');
    const method = this.cleanText(input.method, 80, 'Withdrawal method is required.');
    const destination = this.cleanText(input.destination, 180, 'Withdrawal destination is required.');
    const idempotencyKey = this.cleanText(input.idempotencyKey, 160, 'Idempotency key is required.');

    return this.withTransaction(async (client) => {
      await this.ensureWallet(userId, client);
      const existing = await this.findTransactionByIdempotency(client, userId, idempotencyKey);
      if (existing) return this.transactionResponse(client, userId, existing);

      await this.authorizeWithdrawal(client, userId, input.authorization);

      const wallet = await this.lockWallet(client, userId);
      if (wallet.status !== 'active') {
        throw new HttpError(403, 'WALLET_RESTRICTED', 'This wallet cannot process withdrawals right now.');
      }

      if (Number(wallet.balance) < input.amount) {
        await this.audit(userId, 'withdrawal_rejected_insufficient_funds', undefined, { amount: input.amount, currency: input.currency }, client);
        throw new HttpError(409, 'INSUFFICIENT_FUNDS', 'Insufficient available balance for this withdrawal.');
      }

      const updatedWallet = await this.updateWalletBalance(client, userId, Number(wallet.balance) - input.amount);
      const transaction = await this.insertTransaction(client, userId, {
        type: 'withdraw',
        amount: input.amount,
        currency: input.currency,
        method,
        destination,
        referenceId: this.reference('WDR'),
        status: 'processed',
        idempotencyKey,
        note: 'Withdrawal authorized and processed.',
        details: destination,
      });

      await this.audit(userId, 'withdrawal_authorized', transaction.reference_id, { amount: input.amount, currency: input.currency, method }, client);
      return { referenceId: transaction.reference_id, status: transaction.status, wallet: this.toWalletDto(updatedWallet), transaction: this.toTransactionDto(transaction) };
    });
  }

  private async authorizeWithdrawal(client: PoolClient, userId: string, authorization?: WalletAuthorization) {
    if (!authorization?.type) throw new HttpError(401, 'AUTHORIZATION_REQUIRED', 'Authorize this withdrawal to continue.');
    if (authorization.type === 'biometric') {
      const assertionId = this.cleanText(authorization.biometricAssertionId || '', 120, 'Biometric authorization is required.');
      await this.audit(userId, 'biometric_authorization_verified', undefined, { assertionId }, client);
      return;
    }
    if (authorization.type !== 'pin') throw new HttpError(400, 'INVALID_AUTHORIZATION', 'Choose a valid withdrawal authorization method.');
    await this.verifyPin(client, userId, authorization.pin || '');
  }

  private async verifyPin(client: PoolClient, userId: string, pin: string) {
    const result = await client.query<{ pin_hash: string; failed_attempts: number; locked_until: Date | null }>(
      `
      SELECT pin_hash, failed_attempts, locked_until
      FROM wallet_transaction_pins
      WHERE user_id = $1
      FOR UPDATE
      `,
      [userId]
    );
    const row = result.rows[0];
    if (!row) throw new HttpError(401, 'PIN_REQUIRED', 'Set a transaction PIN before withdrawing.');
    if (row.locked_until && row.locked_until.getTime() > Date.now()) {
      throw new HttpError(429, 'PIN_LOCKED', 'Too many incorrect PIN attempts. Try again later.');
    }

    const valid = this.isPinShape(pin) && (await this.verifyPinHash(pin, row.pin_hash));
    if (!valid) {
      const failedAttempts = row.failed_attempts + 1;
      const lockedUntil = failedAttempts >= PIN_MAX_FAILED_ATTEMPTS ? `now() + interval '${PIN_LOCKOUT_MINUTES} minutes'` : 'NULL';
      await client.query(
        `
        UPDATE wallet_transaction_pins
        SET failed_attempts = $2, locked_until = ${lockedUntil}, updated_at = now()
        WHERE user_id = $1
        `,
        [userId, failedAttempts]
      );
      await this.audit(userId, 'transaction_pin_failed', undefined, { failedAttempts }, client);
      throw new HttpError(401, 'INVALID_PIN', 'Incorrect transaction PIN.');
    }

    await client.query(
      `
      UPDATE wallet_transaction_pins
      SET failed_attempts = 0, locked_until = NULL, updated_at = now()
      WHERE user_id = $1
      `,
      [userId]
    );
    await this.audit(userId, 'transaction_pin_verified', undefined, {}, client);
  }

  private async ensureWallet(userId: string, client: Pool | PoolClient = this.db) {
    const result = await client.query<WalletRow>(
      `
      INSERT INTO wallets (user_id, balance)
      VALUES ($1, $2)
      ON CONFLICT (user_id) DO UPDATE SET user_id = wallets.user_id
      RETURNING *
      `,
      [userId, DEFAULT_WALLET_BALANCE]
    );
    return result.rows[0];
  }

  private async lockWallet(client: PoolClient, userId: string) {
    const result = await client.query<WalletRow>(`SELECT * FROM wallets WHERE user_id = $1 FOR UPDATE`, [userId]);
    if (!result.rows[0]) throw new HttpError(404, 'WALLET_NOT_FOUND', 'Wallet was not found.');
    return result.rows[0];
  }

  private async updateWalletBalance(client: PoolClient, userId: string, balance: number) {
    const result = await client.query<WalletRow>(
      `
      UPDATE wallets
      SET balance = $2, updated_at = now()
      WHERE user_id = $1
      RETURNING *
      `,
      [userId, balance]
    );
    return result.rows[0];
  }

  private async findTransactionByIdempotency(client: PoolClient, userId: string, idempotencyKey: string) {
    const result = await client.query<WalletTransactionRow>(
      `SELECT * FROM wallet_transactions WHERE user_id = $1 AND idempotency_key = $2`,
      [userId, idempotencyKey]
    );
    return result.rows[0];
  }

  private async transactionResponse(client: PoolClient, userId: string, transaction: WalletTransactionRow) {
    const wallet = await this.lockWallet(client, userId);
    return { referenceId: transaction.reference_id, status: transaction.status, wallet: this.toWalletDto(wallet), transaction: this.toTransactionDto(transaction) };
  }

  private async insertTransaction(
    client: PoolClient,
    userId: string,
    input: {
      type: WalletTransactionType;
      amount: number;
      currency: Currency;
      method: string;
      destination: string | null;
      referenceId: string;
      status: WalletTransactionStatus;
      idempotencyKey: string;
      note: string;
      details: string;
    }
  ) {
    const result = await client.query<WalletTransactionRow>(
      `
      INSERT INTO wallet_transactions (user_id, type, amount, currency, method, destination, reference_id, status, idempotency_key, note, details)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
      `,
      [
        userId,
        input.type,
        input.amount,
        input.currency,
        input.method,
        input.destination,
        input.referenceId,
        input.status,
        input.idempotencyKey,
        input.note,
        input.details,
      ]
    );
    return result.rows[0];
  }

  private async audit(userId: string, eventType: string, referenceId?: string, metadata: Record<string, unknown> = {}, client: Pool | PoolClient = this.db) {
    await client.query(
      `
      INSERT INTO wallet_audit_events (user_id, event_type, reference_id, metadata)
      VALUES ($1, $2, $3, $4)
      `,
      [userId, eventType, referenceId || null, JSON.stringify(metadata)]
    );
  }

  private assertAmount(amount: number, min: number, max: number, label: string) {
    if (!Number.isFinite(amount) || amount <= 0) throw new HttpError(400, 'INVALID_AMOUNT', `Enter a valid ${label} amount.`);
    if (amount < min) throw new HttpError(400, 'AMOUNT_TOO_LOW', `Minimum ${label} is ${min} units.`);
    if (amount > max) throw new HttpError(400, 'AMOUNT_TOO_HIGH', `Maximum ${label} is ${max.toLocaleString()} units.`);
  }

  private assertPin(pin: string) {
    if (!this.isPinShape(pin)) throw new HttpError(400, 'INVALID_PIN', 'Transaction PIN must be 4 to 6 digits.');
  }

  private isPinShape(pin: string) {
    return /^\d{4,6}$/.test(pin);
  }

  private cleanText(value: string, maxLength: number, message: string) {
    const clean = String(value || '').trim();
    if (!clean) throw new HttpError(400, 'INVALID_INPUT', message);
    return clean.slice(0, maxLength);
  }

  private async hashPin(pin: string) {
    const salt = randomBytes(16).toString('hex');
    const hash = (await scrypt(pin, salt, 64)) as Buffer;
    return `scrypt$${salt}$${hash.toString('hex')}`;
  }

  private async verifyPinHash(pin: string, storedHash: string) {
    const [, salt, hashHex] = storedHash.split('$');
    if (!salt || !hashHex) return false;
    const expected = Buffer.from(hashHex, 'hex');
    const actual = (await scrypt(pin, salt, expected.length)) as Buffer;
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  private reference(prefix: string) {
    return `${prefix}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${randomBytes(4).toString('hex').toUpperCase()}`;
  }

  private toWalletDto(row: WalletRow) {
    return {
      userId: row.user_id,
      balance: Number(row.balance),
      lockedBalance: Number(row.locked_balance),
      currency: row.currency,
      status: row.status,
    };
  }

  private toTransactionDto(row: WalletTransactionRow) {
    return {
      id: row.id,
      type: row.type,
      amount: Number(row.amount),
      createdAt: row.created_at.toISOString(),
      status: row.status,
      currency: row.currency,
      method: row.method || undefined,
      referenceId: row.reference_id,
      note: row.note || undefined,
      details: row.details || row.destination || undefined,
      idempotencyKey: row.idempotency_key,
    };
  }

  private async withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const value = await fn(client);
      await client.query('COMMIT');
      return value;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
