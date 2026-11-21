import { AI_PROVIDERS } from '@pod/contracts';
import { AppError } from '../../shared/app-error.js';

export class SecretStorageUnavailableError extends AppError {
  constructor() {
    super('SECRET_STORAGE_UNAVAILABLE', 'The system keychain is not available to protect secrets');
  }
}

export const SECRET_NAMES = [
  'printful',
  'dropbox',
  's3',
  'etsy',
  'pinterest',
  ...AI_PROVIDERS,
] as const;
export type SecretName = (typeof SECRET_NAMES)[number];

/** Secrets to store and secrets to forget, applied as one write. */
export interface SecretChanges {
  readonly set?: Partial<Record<SecretName, string>>;
  readonly remove?: readonly SecretName[];
}

/** Where connection secrets are kept, protected by the system keychain. */
export interface SecretStore {
  get(name: SecretName): Promise<string | undefined>;
  update(changes: SecretChanges): Promise<void>;
  /**
   * Rewrites one secret from its current value in the same step, so no other
   * change can land between reading and writing. `undefined` keeps it.
   */
  edit(
    name: SecretName,
    rewrite: (current: string | undefined) => string | undefined,
  ): Promise<void>;
  /** Throws when secrets cannot be protected, so callers can stop before doing any work. */
  assertWritable(): void;
}
