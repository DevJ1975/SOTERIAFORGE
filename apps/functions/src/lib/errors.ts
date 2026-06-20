/**
 * Typed domain errors thrown by the pure cores. The thin v2 wrappers in main.ts
 * map these onto firebase-functions HttpsError codes 1:1.
 */
export type DomainErrorCode =
  | 'invalid-argument'
  | 'permission-denied'
  | 'not-found'
  | 'already-exists'
  | 'resource-exhausted'
  | 'unavailable';

export class FunctionsDomainError extends Error {
  readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.name = 'FunctionsDomainError';
    this.code = code;
  }
}
