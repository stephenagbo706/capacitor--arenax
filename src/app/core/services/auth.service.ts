import { Injectable } from '@angular/core';
import { initializeApp, getApp, getApps } from 'firebase/app';
import {
  Auth,
  User,
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  indexedDBLocalPersistence,
  inMemoryPersistence,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { environment } from '../../../environments/environment';
import { ArenaService } from './arena.service';

type AuthResult = { ok: true } | { ok: false; message: string };

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly auth: Auth | null;
  private readonly ready: Promise<void>;
  private didResolveInitialAuthState = false;

  constructor(private arena: ArenaService) {
    if (!this.hasFirebaseConfig()) {
      this.auth = null;
      this.ready = Promise.resolve();
      return;
    }

    const app = getApps().length ? getApp() : initializeApp(environment.firebase);
    this.auth = getAuth(app);

    this.ready = this.initializeAuthState();
  }

  async waitUntilReady() {
    await this.ready;
  }

  isAuthenticated() {
    return !!this.auth?.currentUser;
  }

  async login(email: string, password: string): Promise<AuthResult> {
    if (!this.auth) return { ok: false, message: 'Firebase Auth is not configured.' };

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPassword = password.trim();
    if (!normalizedEmail) return { ok: false, message: 'Email is required.' };
    if (!normalizedPassword) return { ok: false, message: 'Password is required.' };

    try {
      await signInWithEmailAndPassword(this.auth, normalizedEmail, normalizedPassword);
      return { ok: true };
    } catch (error) {
      return { ok: false, message: this.resolveErrorMessage(error) };
    }
  }

  async register(username: string, email: string, password: string): Promise<AuthResult> {
    if (!this.auth) return { ok: false, message: 'Firebase Auth is not configured.' };

    const normalizedUsername = username.trim();
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPassword = password.trim();

    if (!normalizedUsername) return { ok: false, message: 'Username is required.' };
    if (!normalizedEmail) return { ok: false, message: 'Email is required.' };
    if (!normalizedPassword) return { ok: false, message: 'Password is required.' };

    try {
      const credential = await createUserWithEmailAndPassword(this.auth, normalizedEmail, normalizedPassword);
      if (normalizedUsername) {
        await updateProfile(credential.user, { displayName: normalizedUsername });
      }
      this.syncArenaUser(credential.user, normalizedUsername);
      return { ok: true };
    } catch (error) {
      return { ok: false, message: this.resolveErrorMessage(error) };
    }
  }

  async sendPasswordReset(email: string): Promise<AuthResult> {
    if (!this.auth) return { ok: false, message: 'Firebase Auth is not configured.' };

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return { ok: false, message: 'Email is required.' };

    try {
      await sendPasswordResetEmail(this.auth, normalizedEmail);
      return { ok: true };
    } catch (error) {
      return { ok: false, message: this.resolveErrorMessage(error) };
    }
  }

  async logout() {
    if (this.auth) {
      await signOut(this.auth);
    } else {
      this.arena.logout();
    }
  }

  private async initializeAuthState() {
    if (!this.auth) return;

    try {
      await setPersistence(this.auth, indexedDBLocalPersistence);
    } catch {
      try {
        await setPersistence(this.auth, browserLocalPersistence);
      } catch {
        await setPersistence(this.auth, inMemoryPersistence);
      }
    }

    await new Promise<void>((resolve) => {
      onAuthStateChanged(this.auth!, (user) => {
        this.syncArenaUser(user);
        if (!this.didResolveInitialAuthState) {
          this.didResolveInitialAuthState = true;
          resolve();
        }
      });
    });
  }

  private syncArenaUser(user: User | null, usernameOverride?: string) {
    if (!user) {
      this.arena.logout();
      return;
    }

    const email = user.email?.trim().toLowerCase();
    if (!email) {
      this.arena.logout();
      return;
    }

    const username = usernameOverride || user.displayName || email.split('@')[0] || 'ArenaX Player';
    this.arena.syncFromAuthUser({ uid: user.uid, email, username });
  }

  private hasFirebaseConfig() {
    const config = environment.firebase;
    return Boolean(config?.apiKey && config?.authDomain && config?.projectId && config?.appId);
  }

  private resolveErrorMessage(error: unknown) {
    const code = (error as { code?: string })?.code || '';
    switch (code) {
      case 'auth/invalid-email':
        return 'Invalid email address.';
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
        return 'Incorrect email or password.';
      case 'auth/user-not-found':
        return 'No account found for this email.';
      case 'auth/email-already-in-use':
        return 'Email is already registered.';
      case 'auth/weak-password':
        return 'Password is too weak.';
      case 'auth/too-many-requests':
        return 'Too many attempts. Try again later.';
      case 'auth/network-request-failed':
        return 'Network error. Check your internet connection.';
      default:
        return 'Authentication failed. Please try again.';
    }
  }
}
