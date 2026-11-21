import { ConnectionFailedError } from '../errors/connection-errors.js';
import type { SecretSlot } from './secret-slot.js';
import { checked } from './checked.js';

interface PkcePair {
  readonly verifier: string;
  readonly challenge: string;
}

/** Talks to Dropbox while connecting. */
export interface DropboxChecks {
  createPkcePair(): PkcePair;
  authorizeUrl(appKey: string, challenge: string): string;
  /** Exchanges the code the user copied from Dropbox for a refresh token. */
  refreshToken(appKey: string, code: string, verifier: string): Promise<string>;
}

interface DropboxSecret {
  readonly appKey: string;
  readonly refreshToken: string;
}

interface PendingDropbox {
  readonly appKey: string;
  readonly verifier: string;
}

/** Connects Dropbox in two steps: the seller allows access in the browser and pastes the code. */
export class DropboxConnection {
  private pending: PendingDropbox | undefined;

  constructor(
    private readonly secret: Pick<SecretSlot<DropboxSecret>, 'save'>,
    private readonly checks: DropboxChecks,
  ) {}

  /** The address where the seller allows access; the code it shows finishes the connection. */
  start(appKey: string): string {
    const { verifier, challenge } = this.checks.createPkcePair();
    this.pending = { appKey, verifier };
    return this.checks.authorizeUrl(appKey, challenge);
  }

  /** Forgets a connection begun but not finished, so a code shown before cannot finish it. */
  cancel(): void {
    this.pending = undefined;
  }

  async finish(code: string): Promise<void> {
    const pending = this.pending;
    if (!pending) throw new ConnectionFailedError('dropbox', 'Start connecting Dropbox first');
    const refreshToken = await checked('dropbox', () =>
      this.checks.refreshToken(pending.appKey, code, pending.verifier),
    );
    await this.secret.save({ appKey: pending.appKey, refreshToken });
    if (this.pending === pending) this.pending = undefined;
  }
}
