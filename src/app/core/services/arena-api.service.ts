import { Injectable } from '@angular/core';
import { getAuth } from 'firebase/auth';
import { getApps } from 'firebase/app';
import { environment } from '../../../environments/environment';
import {
  ApiError,
  ApiResponse,
  DepositRequest,
  DepositResponse,
  MatchReviewRequest,
  MatchReviewResponse,
  ResultSubmissionRequest,
  ResultSubmissionResponse,
  TournamentRegistrationRequest,
  TournamentRegistrationResponse,
  WalletSnapshot,
  WalletSecurityStatus,
  WithdrawalRequest,
  WithdrawalResponse,
} from '../models/api.models';

type HttpMethod = 'GET' | 'POST';

@Injectable({ providedIn: 'root' })
export class ArenaApiService {
  private readonly apiUrl = (environment.apiUrl || '').replace(/\/$/, '');

  get isConfigured() {
    return Boolean(this.apiUrl);
  }

  getWallet() {
    return this.request<WalletSnapshot>('GET', '/wallet');
  }

  getWalletSecurity() {
    return this.request<WalletSecurityStatus>('GET', '/wallet/security');
  }

  setTransactionPin(pin: string) {
    return this.request<WalletSecurityStatus>('POST', '/wallet/transaction-pin', { pin });
  }

  createDeposit(payload: DepositRequest) {
    return this.request<DepositResponse>('POST', '/wallet/deposits', payload);
  }

  requestWithdrawal(payload: WithdrawalRequest) {
    return this.request<WithdrawalResponse>('POST', '/wallet/withdrawals', payload);
  }

  joinTournament(tournamentId: string, payload: TournamentRegistrationRequest) {
    return this.request<TournamentRegistrationResponse>('POST', `/tournaments/${encodeURIComponent(tournamentId)}/join`, payload);
  }

  submitMatchResult(matchId: string, payload: ResultSubmissionRequest) {
    return this.request<ResultSubmissionResponse>(
      'POST',
      `/matches/${encodeURIComponent(matchId)}/result-submissions`,
      payload
    );
  }

  reviewMatch(matchId: string, payload: MatchReviewRequest) {
    return this.request<MatchReviewResponse>('POST', `/admin/matches/${encodeURIComponent(matchId)}/review`, payload);
  }

  completeTournament(tournamentId: string, idempotencyKey: string) {
    return this.request<{ tournament: TournamentRegistrationResponse['tournament'] }>(
      'POST',
      `/admin/tournaments/${encodeURIComponent(tournamentId)}/complete`,
      { idempotencyKey }
    );
  }

  private async request<T>(method: HttpMethod, path: string, body?: unknown): Promise<ApiResponse<T>> {
    if (!this.apiUrl) {
      return this.fail('API_NOT_CONFIGURED', 'ArenaX backend API is not configured for this build.');
    }

    const token = await this.getFirebaseToken();
    if (!token) {
      return this.fail('AUTH_REQUIRED', 'Sign in again before performing this action.');
    }

    try {
      const response = await fetch(`${this.apiUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });

      const json = (await this.readJson(response)) as ApiResponse<T> | T | { error?: Partial<ApiError>; message?: string };
      if (!response.ok) {
        const error = this.extractError(json, response.status);
        return { success: false, error };
      }

      if (this.isApiResponse<T>(json)) return json;
      return { success: true, data: json as T };
    } catch {
      return this.fail('NETWORK_ERROR', 'Unable to reach the ArenaX backend. Check your connection and try again.');
    }
  }

  private async getFirebaseToken() {
    if (!getApps().length) return '';
    const user = getAuth().currentUser;
    if (!user) return '';
    return user.getIdToken().catch(() => '');
  }

  private async readJson(response: Response) {
    const text = await response.text();
    if (!text) return {};
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return {};
    }
  }

  private isApiResponse<T>(value: unknown): value is ApiResponse<T> {
    if (!value || typeof value !== 'object') return false;
    return 'success' in value;
  }

  private extractError(value: unknown, status: number): ApiError {
    if (value && typeof value === 'object') {
      const maybeError = (value as { error?: Partial<ApiError>; message?: string }).error;
      if (maybeError?.message) {
        return {
          code: maybeError.code || `HTTP_${status}`,
          message: maybeError.message,
          details: maybeError.details,
        };
      }
      const message = (value as { message?: string }).message;
      if (message) return { code: `HTTP_${status}`, message };
    }
    return { code: `HTTP_${status}`, message: 'ArenaX backend rejected the request.' };
  }

  private fail<T>(code: string, message: string): ApiResponse<T> {
    return {
      success: false,
      error: { code, message },
    };
  }
}
