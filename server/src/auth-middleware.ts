import type { NextFunction, Response } from 'express';
import type { AuthVerifier } from './firebase-admin';
import { HttpError } from './http-errors';
import type { AuthenticatedRequest } from './types';

export function bearerToken(value?: string) {
  if (!value) return '';
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || '';
}

export function requireAuth(authVerifier: AuthVerifier) {
  return async (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    try {
      const token = bearerToken(req.header('authorization'));
      if (!token) throw new HttpError(401, 'UNAUTHENTICATED', 'Authentication token is required.');
      req.user = await authVerifier.verifyToken(token);
      next();
    } catch (error) {
      next(error instanceof HttpError ? error : new HttpError(401, 'UNAUTHENTICATED', 'Invalid authentication token.'));
    }
  };
}

export function currentUser(req: AuthenticatedRequest) {
  if (!req.user) throw new HttpError(401, 'UNAUTHENTICATED', 'Authentication token is required.');
  return req.user;
}
