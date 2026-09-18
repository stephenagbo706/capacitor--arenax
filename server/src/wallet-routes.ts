import { Router } from 'express';
import { currentUser } from './auth-middleware';
import { HttpError } from './http-errors';
import type { AuthenticatedRequest } from './types';
import type { WalletAuthorization, WalletRepository } from './wallet-repository';

function currency(value: unknown) {
  return value === 'USD' ? 'USD' : 'NGN';
}

function amount(value: unknown) {
  return Number(value);
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function authorization(value: unknown): WalletAuthorization {
  if (!value || typeof value !== 'object') {
    throw new HttpError(401, 'AUTHORIZATION_REQUIRED', 'Authorize this withdrawal to continue.');
  }
  const body = value as { type?: unknown; pin?: unknown; biometricAssertionId?: unknown };
  return {
    type: body.type === 'biometric' ? 'biometric' : 'pin',
    pin: stringValue(body.pin),
    biometricAssertionId: stringValue(body.biometricAssertionId),
  };
}

export function createWalletRouter(wallet: WalletRepository) {
  const router = Router();

  router.get('/', async (req: AuthenticatedRequest, res, next) => {
    try {
      const user = currentUser(req);
      res.json(await wallet.getWallet(user.uid));
    } catch (error) {
      next(error);
    }
  });

  router.get('/security', async (req: AuthenticatedRequest, res, next) => {
    try {
      const user = currentUser(req);
      res.json(await wallet.getSecurity(user.uid));
    } catch (error) {
      next(error);
    }
  });

  router.post('/transaction-pin', async (req: AuthenticatedRequest, res, next) => {
    try {
      const user = currentUser(req);
      res.json(await wallet.setTransactionPin(user.uid, stringValue(req.body?.pin)));
    } catch (error) {
      next(error);
    }
  });

  router.post('/deposits', async (req: AuthenticatedRequest, res, next) => {
    try {
      const user = currentUser(req);
      const response = await wallet.createDeposit(user.uid, {
        amount: amount(req.body?.amount),
        currency: currency(req.body?.currency),
        method: stringValue(req.body?.method),
        idempotencyKey: stringValue(req.body?.idempotencyKey),
      });
      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  });

  router.post('/withdrawals', async (req: AuthenticatedRequest, res, next) => {
    try {
      const user = currentUser(req);
      const response = await wallet.requestWithdrawal(user.uid, {
        amount: amount(req.body?.amount),
        currency: currency(req.body?.currency),
        method: stringValue(req.body?.method),
        destination: stringValue(req.body?.destination),
        idempotencyKey: stringValue(req.body?.idempotencyKey),
        authorization: authorization(req.body?.authorization),
      });
      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  });

  router.use((_req, _res, next) => next(new HttpError(404, 'NOT_FOUND', 'Wallet endpoint was not found.')));
  return router;
}
