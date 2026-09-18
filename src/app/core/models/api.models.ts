import { Currency, Match, Tournament, TransactionItem, UserProfile } from './arena.models';

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export type ApiResponse<T> =
  | {
      success: true;
      data: T;
    }
  | {
      success: false;
      error: ApiError;
    };

export interface Wallet {
  userId: string;
  balance: number;
  lockedBalance: number;
  currency: Currency;
  status: 'active' | 'restricted' | 'suspended';
}

export interface WalletTransaction extends TransactionItem {
  idempotencyKey?: string;
}

export interface WalletSnapshot {
  wallet: Wallet;
  transactions: WalletTransaction[];
  user?: Pick<UserProfile, 'id' | 'walletBalance' | 'lockedBalance'>;
}

export interface WalletSecurityStatus {
  hasTransactionPin: boolean;
  pinLockedUntil?: string;
  biometricAvailable: boolean;
}

export interface DepositRequest {
  amount: number;
  currency: Currency;
  method: string;
  idempotencyKey: string;
}

export interface DepositResponse {
  referenceId: string;
  status: 'pending' | 'completed' | 'failed';
  wallet?: Wallet;
  transaction?: WalletTransaction;
}

export interface WithdrawalRequest {
  amount: number;
  currency: Currency;
  method: string;
  destination: string;
  idempotencyKey: string;
  authorization: {
    type: 'pin' | 'biometric';
    pin?: string;
    biometricAssertionId?: string;
  };
}

export interface WithdrawalResponse {
  referenceId: string;
  status: 'pending' | 'processed' | 'failed';
  wallet?: Wallet;
  transaction?: WalletTransaction;
}

export interface TournamentRegistrationRequest {
  paymentCurrency: Currency;
  idempotencyKey: string;
}

export interface TournamentRegistrationResponse {
  tournament: Tournament;
  wallet?: Wallet;
  transaction?: WalletTransaction;
}

export type ResultSubmissionStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'AI_VERIFIED'
  | 'MANUAL_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'DISPUTED';

export interface ResultSubmission {
  id: string;
  matchId: string;
  submittedBy: string;
  screenshotUrl: string;
  submittedScore?: string;
  status: ResultSubmissionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface VerificationResult {
  id: string;
  resultSubmissionId: string;
  extractedPlayerData?: Record<string, unknown>;
  extractedScore?: string;
  confidence?: number;
  verificationStatus: ResultSubmissionStatus;
  reason?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
}

export interface ResultSubmissionRequest {
  screenshotDataUrl: string;
  fileName: string;
  mimeType: 'image/png' | 'image/jpeg';
  size: number;
  submittedScore?: string;
  idempotencyKey: string;
}

export interface ResultSubmissionResponse {
  match?: Match;
  resultSubmission: ResultSubmission;
  verification?: VerificationResult;
}

export interface MatchReviewRequest {
  decision: 'approved' | 'rejected';
  note?: string;
  idempotencyKey: string;
}

export interface MatchReviewResponse {
  match: Match;
  wallet?: Wallet;
  transaction?: WalletTransaction;
  verification?: VerificationResult;
}
