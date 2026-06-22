/**
 * Maps a Firebase Auth error to a Transloco translation key under `auth.errors`.
 * Centralises the friendly-message mapping so every auth surface (login,
 * forgot-password, storefront sign-up/in) stays consistent. Consumers translate
 * the returned key, e.g. `transloco.translate(authErrorMessageKey(err))`.
 */
export function authErrorMessageKey(err: unknown): string {
  const code = (err as { code?: string } | null | undefined)?.code;
  switch (code) {
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'auth.errors.invalidCredentials';
    case 'auth/email-already-in-use':
      return 'auth.errors.emailInUse';
    case 'auth/weak-password':
      return 'auth.errors.weakPassword';
    case 'auth/invalid-email':
      return 'auth.errors.invalidEmail';
    case 'auth/too-many-requests':
      return 'auth.errors.tooManyRequests';
    case 'auth/network-request-failed':
      return 'auth.errors.network';
    default:
      return 'auth.errors.generic';
  }
}
