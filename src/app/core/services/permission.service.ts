import { Injectable } from '@angular/core';
import { Capacitor, PermissionState, registerPlugin } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Geolocation } from '@capacitor/geolocation';
import { PushNotifications } from '@capacitor/push-notifications';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import {
  AndroidBiometryStrength,
  BiometricAuth,
  BiometryError,
  BiometryErrorType,
  BiometryType,
} from '@aparajita/capacitor-biometric-auth';

export type ArenaPermissionState = 'granted' | 'denied' | 'prompt' | 'restricted' | 'unavailable';

export interface ArenaPermissionResult {
  state: ArenaPermissionState;
  message?: string;
  canOpenSettings?: boolean;
}

export interface BiometricPermissionResult extends ArenaPermissionResult {
  label: string;
  assertionId?: string;
}

export interface ArenaPermissionItem {
  key: 'camera' | 'photos' | 'location' | 'notifications' | 'biometrics' | 'haptics' | 'internet';
  title: string;
  detail: string;
  state: ArenaPermissionState;
  label: string;
  canRequest: boolean;
  canOpenSettings: boolean;
}

const ArenaXSettings = registerPlugin<{ openAppSettings: () => Promise<{ opened: boolean }> }>('ArenaXSettings');

@Injectable({ providedIn: 'root' })
export class PermissionService {
  async getPermissionItems(): Promise<ArenaPermissionItem[]> {
    const [camera, photos, location, notifications, biometrics] = await Promise.all([
      this.checkCameraAccess(),
      this.checkPhotoAccess(),
      this.checkLocationAccess(),
      this.checkNotificationAccess(),
      this.checkBiometrics(),
    ]);

    return [
      {
        key: 'camera',
        title: 'Camera',
        detail: 'Used when you capture an ArenaX image.',
        state: camera.state,
        label: this.stateLabel(camera.state),
        canRequest: camera.state !== 'granted',
        canOpenSettings: Boolean(camera.canOpenSettings),
      },
      {
        key: 'photos',
        title: 'Photos',
        detail: 'Used when you select an image for your profile or uploads.',
        state: photos.state,
        label: this.stateLabel(photos.state),
        canRequest: photos.state !== 'granted',
        canOpenSettings: Boolean(photos.canOpenSettings),
      },
      {
        key: 'location',
        title: 'Location',
        detail: 'Used only for nearby ArenaX features.',
        state: location.state,
        label: location.label || this.stateLabel(location.state),
        canRequest: location.state !== 'granted',
        canOpenSettings: Boolean(location.canOpenSettings),
      },
      {
        key: 'notifications',
        title: 'Notifications',
        detail: 'Match, wallet, tournament, account, and security alerts.',
        state: notifications.state,
        label: this.stateLabel(notifications.state),
        canRequest: notifications.state !== 'granted',
        canOpenSettings: Boolean(notifications.canOpenSettings),
      },
      {
        key: 'biometrics',
        title: biometrics.label,
        detail: 'Used to authorize protected wallet actions on this device.',
        state: biometrics.state,
        label: this.stateLabel(biometrics.state),
        canRequest: false,
        canOpenSettings: Boolean(biometrics.canOpenSettings),
      },
      {
        key: 'haptics',
        title: 'Haptics',
        detail: 'Used for light confirmation feedback.',
        state: Capacitor.isNativePlatform() ? 'granted' : 'unavailable',
        label: Capacitor.isNativePlatform() ? 'Available' : 'Mobile only',
        canRequest: false,
        canOpenSettings: false,
      },
      {
        key: 'internet',
        title: 'Internet',
        detail: 'Required for login, wallet, chat, games, Firebase, and backend access.',
        state: 'granted',
        label: 'Declared',
        canRequest: false,
        canOpenSettings: false,
      },
    ];
  }

  async requestPermission(key: ArenaPermissionItem['key']): Promise<ArenaPermissionResult> {
    switch (key) {
      case 'camera':
        return this.ensureCameraAccess();
      case 'photos':
        return this.ensurePhotoAccess();
      case 'location':
        return this.getApproximateLocation();
      case 'notifications':
        return this.enableNotifications();
      default:
        return { state: 'unavailable', message: 'This capability does not use an Android runtime permission prompt.' };
    }
  }

  async checkCameraAccess(): Promise<ArenaPermissionResult> {
    if (!Capacitor.isNativePlatform()) return { state: 'granted' };
    const current = await Camera.checkPermissions();
    return this.toResult(current.camera, 'Camera access is needed when you capture an image in ArenaX.');
  }

  async ensureCameraAccess(): Promise<ArenaPermissionResult> {
    if (!Capacitor.isNativePlatform()) return { state: 'granted' };
    const current = await Camera.checkPermissions();
    if (this.isAllowed(current.camera)) return { state: 'granted' };
    const requested = await Camera.requestPermissions({ permissions: ['camera'] });
    return this.toResult(requested.camera, 'Camera access is needed when you capture an image in ArenaX.');
  }

  async checkPhotoAccess(): Promise<ArenaPermissionResult> {
    if (!Capacitor.isNativePlatform()) return { state: 'granted' };
    const current = await Camera.checkPermissions();
    return this.toResult(current.photos, 'Photo access is needed when you choose an image for ArenaX.');
  }

  async ensurePhotoAccess(): Promise<ArenaPermissionResult> {
    if (!Capacitor.isNativePlatform()) return { state: 'granted' };
    const current = await Camera.checkPermissions();
    if (this.isAllowed(current.photos)) return { state: 'granted' };
    const requested = await Camera.requestPermissions({ permissions: ['photos'] });
    return this.toResult(requested.photos, 'Photo access is needed when you choose an image for ArenaX.');
  }

  async checkLocationAccess(): Promise<ArenaPermissionResult & { label?: string }> {
    if (!Capacitor.isNativePlatform()) return { state: 'unavailable', label: 'Mobile only' };
    try {
      const current = await Geolocation.checkPermissions();
      if (current.location === 'granted') return { state: 'granted', label: 'Precise' };
      if (current.coarseLocation === 'granted') return { state: 'granted', label: 'Approximate' };
      return { ...this.toResult(current.coarseLocation, 'Location access is needed only for nearby ArenaX features.'), label: this.stateLabel(current.coarseLocation) };
    } catch {
      return { state: 'unavailable', label: 'Unavailable', message: 'Location services are unavailable on this device.', canOpenSettings: true };
    }
  }

  async pickProfileImage() {
    const photoAccess = await this.ensurePhotoAccess();
    if (photoAccess.state !== 'granted') return { ...photoAccess, dataUrl: '' };

    try {
      const photo = await Camera.getPhoto({
        source: CameraSource.Prompt,
        resultType: CameraResultType.DataUrl,
        quality: 84,
        width: 720,
        height: 720,
        allowEditing: true,
        promptLabelHeader: 'Profile Image',
        promptLabelPhoto: 'Choose from Photos',
        promptLabelPicture: 'Take Picture',
        promptLabelCancel: 'Not Now',
      });
      return { state: 'granted' as const, dataUrl: photo.dataUrl || '' };
    } catch {
      return { state: 'denied' as const, dataUrl: '', message: 'Profile image selection was cancelled.' };
    }
  }

  async getApproximateLocation(): Promise<ArenaPermissionResult & { coords?: { latitude: number; longitude: number; accuracy: number } }> {
    if (!Capacitor.isNativePlatform()) return { state: 'unavailable', message: 'Location is available in the mobile app.' };

    try {
      const current = await Geolocation.checkPermissions();
      let state = current.coarseLocation;
      if (!this.isAllowed(state)) {
        const requested = await Geolocation.requestPermissions({ permissions: ['coarseLocation'] });
        state = requested.coarseLocation;
      }
      if (!this.isAllowed(state)) {
        return this.toResult(state, 'Location access is needed only for nearby ArenaX features.');
      }
      const position = await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 10000 });
      return {
        state: 'granted',
        coords: {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        },
      };
    } catch {
      return { state: 'denied', message: 'ArenaX could not access your location right now.', canOpenSettings: true };
    }
  }

  async enableNotifications(): Promise<ArenaPermissionResult> {
    if (!Capacitor.isNativePlatform()) return { state: 'unavailable', message: 'Push notifications are available in the mobile app.' };
    const current = await PushNotifications.checkPermissions();
    const status = current.receive === 'prompt' ? await PushNotifications.requestPermissions() : current;
    if (status.receive === 'granted') {
      await PushNotifications.register();
      return { state: 'granted' };
    }
    return this.toResult(status.receive, 'Notifications can be enabled later for match, wallet, tournament, and security alerts.');
  }

  async checkNotificationAccess(): Promise<ArenaPermissionResult> {
    if (!Capacitor.isNativePlatform()) return { state: 'unavailable', message: 'Push notifications are available in the mobile app.' };
    const current = await PushNotifications.checkPermissions();
    return this.toResult(current.receive, 'Notifications can be enabled for match, wallet, tournament, and security alerts.');
  }

  async checkBiometrics(): Promise<BiometricPermissionResult> {
    if (!Capacitor.isNativePlatform()) {
      return { state: 'unavailable', label: 'Biometric', message: 'Biometric authentication is available in the mobile app.' };
    }

    try {
      const result = await BiometricAuth.checkBiometry();
      if (!result.isAvailable) {
        return {
          state: result.biometryType === BiometryType.none ? 'unavailable' : 'restricted',
          label: this.biometryLabel(result.biometryType),
          message: result.reason || 'Biometric authentication is not available on this device.',
          canOpenSettings: true,
        };
      }
      return { state: 'granted', label: this.biometryLabel(result.biometryType) };
    } catch {
      return { state: 'unavailable', label: 'Biometric', message: 'Biometric authentication is unavailable.' };
    }
  }

  async authenticateBiometric(): Promise<BiometricPermissionResult> {
    const availability = await this.checkBiometrics();
    if (availability.state !== 'granted') return availability;

    try {
      await BiometricAuth.authenticate({
        reason: 'Authorize this ArenaX withdrawal',
        cancelTitle: 'Cancel',
        allowDeviceCredential: true,
        iosFallbackTitle: 'Use Passcode',
        androidTitle: 'Confirm Withdrawal',
        androidSubtitle: `Use ${availability.label.toLowerCase()} or your screen lock to continue`,
        androidConfirmationRequired: false,
        androidBiometryStrength: AndroidBiometryStrength.weak,
      });

      await this.notifySuccess();
      return { ...availability, assertionId: this.createBiometricAssertionId() };
    } catch (error) {
      await this.notifyFailure();
      if (error instanceof BiometryError) {
        if (error.code === BiometryErrorType.userCancel || error.code === BiometryErrorType.systemCancel) {
          return { ...availability, state: 'denied', message: 'Biometric authentication was cancelled.' };
        }
        if (error.code === BiometryErrorType.biometryNotEnrolled) {
          return { ...availability, state: 'restricted', message: 'No biometric is enrolled on this device.', canOpenSettings: true };
        }
        if (error.code === BiometryErrorType.biometryLockout) {
          return { ...availability, state: 'restricted', message: 'Biometric authentication is temporarily locked. Use your device screen lock or Transaction PIN.', canOpenSettings: true };
        }
        if (error.code === BiometryErrorType.passcodeNotSet || error.code === BiometryErrorType.noDeviceCredential) {
          return { ...availability, state: 'restricted', message: 'Set a device screen lock before using biometric withdrawal approval.', canOpenSettings: true };
        }
      }
      return { ...availability, state: 'denied', message: 'Biometric authentication failed. Use Transaction PIN instead.' };
    }
  }

  async openAppSettings(): Promise<ArenaPermissionResult> {
    if (Capacitor.getPlatform() === 'android') {
      try {
        await ArenaXSettings.openAppSettings();
        return { state: 'granted' };
      } catch {
        return {
          state: 'unavailable',
          message: 'Open ArenaX from your device Settings app to update this permission.',
          canOpenSettings: false,
        };
      }
    }
    return {
      state: 'unavailable',
      message: 'Open ArenaX from your device Settings app to update this permission.',
      canOpenSettings: false,
    };
  }

  async tap() {
    if (!Capacitor.isNativePlatform()) return;
    await Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
  }

  async notifySuccess() {
    if (!Capacitor.isNativePlatform()) return;
    await Haptics.notification({ type: NotificationType.Success }).catch(() => {});
  }

  async notifyFailure() {
    if (!Capacitor.isNativePlatform()) return;
    await Haptics.notification({ type: NotificationType.Error }).catch(() => {});
  }

  private isAllowed(state: PermissionState | 'limited') {
    return state === 'granted' || state === 'limited';
  }

  private toResult(state: PermissionState | 'limited', message: string): ArenaPermissionResult {
    if (this.isAllowed(state)) return { state: 'granted' };
    if (state === 'prompt') return { state: 'prompt', message };
    if (state === 'denied') return { state: 'denied', message, canOpenSettings: true };
    return { state: 'restricted', message, canOpenSettings: true };
  }

  private stateLabel(state: ArenaPermissionState | PermissionState | 'limited') {
    switch (state) {
      case 'granted':
        return 'Allowed';
      case 'limited':
        return 'Limited';
      case 'prompt':
        return 'Needs approval';
      case 'denied':
        return 'Disabled';
      case 'restricted':
        return 'Restricted';
      default:
        return 'Unavailable';
    }
  }

  private biometryLabel(type: BiometryType) {
    switch (type) {
      case BiometryType.faceId:
      case BiometryType.faceAuthentication:
        return 'Face ID';
      case BiometryType.touchId:
      case BiometryType.fingerprintAuthentication:
        return 'Fingerprint';
      case BiometryType.irisAuthentication:
        return 'Biometric';
      default:
        return 'Biometric';
    }
  }

  private createBiometricAssertionId() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    const bytes = new Uint8Array(16);
    globalThis.crypto?.getRandomValues?.(bytes);
    if (bytes.some(Boolean)) {
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'));
      return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
    }
    return `bio-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}
