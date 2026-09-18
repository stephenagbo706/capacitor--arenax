import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import type { AuthUser } from './types';

export interface AuthVerifier {
  verifyToken(token: string): Promise<AuthUser>;
}

function initializeFirebaseAdmin() {
  if (getApps().length) return;

  const serviceAccountJson = process.env['FIREBASE_SERVICE_ACCOUNT_JSON'];
  if (serviceAccountJson) {
    initializeApp({ credential: cert(JSON.parse(serviceAccountJson)) });
    return;
  }

  initializeApp({ credential: applicationDefault() });
}

export function createFirebaseAuthVerifier(): AuthVerifier {
  initializeFirebaseAdmin();
  return {
    async verifyToken(token: string) {
      const decoded = await getAuth().verifyIdToken(token, true);
      const decodedRecord = decoded as Record<string, unknown>;
      const roles = Array.isArray(decodedRecord['roles']) ? decodedRecord['roles'].map(String) : [];
      const role = typeof decodedRecord['role'] === 'string' ? decodedRecord['role'] : '';
      return {
        uid: decoded.uid,
        email: decoded.email,
        name: typeof decodedRecord['name'] === 'string' ? decodedRecord['name'] : undefined,
        roles: role ? [...new Set([...roles, role])] : roles,
      };
    },
  };
}
