import { Injectable, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication, type User as NativeAuthUser } from '@capacitor-firebase/authentication';
import { initializeApp, getApp, getApps } from 'firebase/app';
import {
  Auth,
  GoogleAuthProvider,
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
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { environment } from '../../../environments/environment';
import { ArenaService } from './arena.service';
import { RealtimeService } from './realtime.service';

type AuthResult = { ok: true } | { ok: false; message: string };

@Injectable({ providedIn: 'root' })
export class AuthService {
  private arena = inject(ArenaService);
  private realtime = inject(RealtimeService);

  private readonly auth: Auth | null;
  private readonly ready: Promise<void>;
  private didResolveInitialAuthState = false;
  private currentNativeUser: NativeAuthUser | null = null;

  constructor() {
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
    if (Capacitor.isNativePlatform()) return !!this.currentNativeUser;
    return !!this.auth?.currentUser;
  }

  async login(email: string, password: string): Promise<AuthResult> {
    if (!this.auth) return { ok: false, message: 'Firebase Auth is not configured.' };

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPassword = password.trim();
    if (!normalizedEmail) return { ok: false, message: 'Email is required.' };
    if (!normalizedPassword) return { ok: false, message: 'Password is required.' };

    try {
      if (Capacitor.isNativePlatform()) {
        const result = await FirebaseAuthentication.signInWithEmailAndPassword({
          email: normalizedEmail,
          password: normalizedPassword,
        });
        await this.syncNativeArenaUser(result.user);
        return { ok: true };
      }

      await signInWithEmailAndPassword(this.auth, normalizedEmail, normalizedPassword);
      return { ok: true };
    } catch (error) {
      return { ok: false, message: this.resolveErrorMessage(error) };
    }
  }

  async loginWithGoogle(): Promise<AuthResult> {
    if (!this.auth) return { ok: false, message: 'Firebase Auth is not configured.' };

    try {
      let signedInUser: User | null = null;

      if (Capacitor.isNativePlatform()) {
        const result = await FirebaseAuthentication.signInWithGoogle();
        await this.syncNativeArenaUser(result.user);
      } else {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        const userCredential = await signInWithPopup(this.auth, provider);
        signedInUser = userCredential.user;
      }

      if (signedInUser) {
        await this.syncArenaUser(signedInUser);
      }

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
      if (Capacitor.isNativePlatform()) {
        const credential = await FirebaseAuthentication.createUserWithEmailAndPassword({
          email: normalizedEmail,
          password: normalizedPassword,
        });
        await FirebaseAuthentication.updateProfile({ displayName: normalizedUsername });
        await this.syncNativeArenaUser(credential.user, normalizedUsername);
        return { ok: true };
      }

      const credential = await createUserWithEmailAndPassword(this.auth, normalizedEmail, normalizedPassword);
      if (normalizedUsername) {
        await updateProfile(credential.user, { displayName: normalizedUsername });
      }
      await this.syncArenaUser(credential.user, normalizedUsername);
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
      if (Capacitor.isNativePlatform()) {
        await FirebaseAuthentication.sendPasswordResetEmail({ email: normalizedEmail });
        return { ok: true };
      }

      await sendPasswordResetEmail(this.auth, normalizedEmail);
      return { ok: true };
    } catch (error) {
      return { ok: false, message: this.resolveErrorMessage(error) };
    }
  }

  async logout() {
    if (Capacitor.isNativePlatform()) {
      await FirebaseAuthentication.signOut();
      this.currentNativeUser = null;
      this.arena.logout();
      this.realtime.disconnect();
    } else if (this.auth) {
      await signOut(this.auth);
    } else {
      this.arena.logout();
      this.realtime.disconnect();
    }
  }

  private async initializeAuthState() {
    if (!this.auth) return;

    if (Capacitor.isNativePlatform()) {
      await FirebaseAuthentication.addListener('authStateChange', async ({ user }) => {
        await this.syncNativeArenaUser(user);
      });

      const { user } = await FirebaseAuthentication.getCurrentUser();
      await this.syncNativeArenaUser(user);
      this.didResolveInitialAuthState = true;
      return;
    }

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
      onAuthStateChanged(this.auth!, async (user) => {
        await this.syncArenaUser(user);
        if (!this.didResolveInitialAuthState) {
          this.didResolveInitialAuthState = true;
          resolve();
        }
      });
    });
  }

  private async syncArenaUser(user: User | null, usernameOverride?: string) {
    if (!user) {
      this.arena.logout();
      this.realtime.disconnect();
      return;
    }

    const email = user.email?.trim().toLowerCase();
    if (!email) {
      this.arena.logout();
      this.realtime.disconnect();
      return;
    }

    const username = usernameOverride || user.displayName || email.split('@')[0] || 'ArenaX Player';
    this.arena.syncFromAuthUser({ uid: user.uid, email, username, avatar: user.photoURL || undefined });
    const token = await user.getIdToken().catch(() => '');
    this.realtime.connect({
      userId: user.uid,
      email,
      username,
      token: token || undefined,
    });
  }

  private async syncNativeArenaUser(user: NativeAuthUser | null, usernameOverride?: string) {
    this.currentNativeUser = user;

    if (!user) {
      this.arena.logout();
      this.realtime.disconnect();
      return;
    }

    const email = user.email?.trim().toLowerCase();
    if (!email) {
      this.arena.logout();
      this.realtime.disconnect();
      return;
    }

    const username = usernameOverride || user.displayName || email.split('@')[0] || 'ArenaX Player';
    this.arena.syncFromAuthUser({ uid: user.uid, email, username, avatar: user.photoUrl || undefined });
    const token = await FirebaseAuthentication.getIdToken({ forceRefresh: false }).then((result) => result.token).catch(() => '');
    this.realtime.connect({
      userId: user.uid,
      email,
      username,
      token: token || undefined,
    });
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
      case 'auth/popup-closed-by-user':
      case 'auth/cancelled-popup-request':
      case '12501':
        return 'Google Sign-In was cancelled.';
      case 'auth/popup-blocked':
        return 'Google Sign-In was blocked by the browser. Allow popups and try again.';
      case 'auth/account-exists-with-different-credential':
        return 'An ArenaX account already uses this email. Log in with your existing method first.';
      case 'auth/unauthorized-domain':
        return 'This domain is not authorized for Google Sign-In.';
      case 'auth/operation-not-allowed':
        return 'Google Sign-In is not enabled for this ArenaX project.';
      default:
        return 'Authentication failed. Please try again.';
    }
  }
}
