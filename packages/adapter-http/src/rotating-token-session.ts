import type { Clock } from '@pod/core';

export interface RefreshedToken {
  readonly accessToken: string;
  /** A new refresh token when the service rotates them; `null` keeps the one used. */
  readonly refreshToken: string | null;
  readonly expiresInSeconds: number;
}

export interface RotatingTokenSessionOptions<C extends { readonly refreshToken: string }> {
  /** Resolves to `undefined` while nobody signed in. */
  readonly credentials: () => Promise<C | undefined>;
  readonly refresh: (credentials: C, refreshToken: string) => Promise<RefreshedToken>;
  /** Stores a refresh token the service handed out in place of the one it was made from. */
  readonly saveRefreshToken: (previous: string, next: string) => Promise<void>;
  /**
   * Told when a new refresh token could not be stored even on a second try; the
   * sign-in is lost when the app closes before a later call stores it.
   */
  readonly onTokenNotSaved?: ((error: unknown) => void) | undefined;
  readonly clock: Clock;
  readonly notConnected: () => Error;
}

/** What a service's session is made with: the stored sign-in and how to reach the service. */
export type ServiceSessionOptions<C extends { readonly refreshToken: string }> = Omit<
  RotatingTokenSessionOptions<C>,
  'refresh' | 'notConnected'
> & { readonly fetch: typeof fetch };

/** Renew a minute early so a token never expires halfway through an upload. */
const EXPIRY_MARGIN_MS = 60_000;

/** How long a token is used: a minute short of its lifetime, and at least half of it. */
function usableFor(expiresInSeconds: number): number {
  const lifetime = expiresInSeconds * 1000;
  return Math.max(lifetime - EXPIRY_MARGIN_MS, lifetime / 2);
}

interface CachedToken {
  /** The refresh token this access token was made from, to notice a new sign-in. */
  readonly from: string;
  readonly accessToken: string;
  readonly expiresAt: number;
}

/**
 * Hands out access tokens, refreshing them from the stored refresh token.
 * Callers queue behind one refresh, since a service that rotates refresh
 * tokens stops accepting the old one; a new token that could not be stored is
 * tried twice, reported, kept and stored on the next call.
 */
export class RotatingTokenSession<C extends { readonly refreshToken: string }> {
  private cached: CachedToken | undefined;
  private current: Promise<string> | undefined;
  private unsaved: { readonly replaced: string; readonly token: string } | undefined;

  constructor(private readonly options: RotatingTokenSessionOptions<C>) {}

  async credentials(): Promise<C> {
    const credentials = await this.options.credentials();
    if (!credentials) throw this.options.notConnected();
    return credentials;
  }

  accessToken(): Promise<string> {
    this.current ??= this.obtain().finally(() => {
      this.current = undefined;
    });
    return this.current;
  }

  /** Forgets the cached token, e.g. after the service rejected it. */
  invalidate(): void {
    this.cached = undefined;
  }

  private async obtain(): Promise<string> {
    const credentials = await this.credentials();
    const stored = credentials.refreshToken;
    const latest = this.unsaved?.replaced === stored ? this.unsaved.token : stored;
    if (latest !== stored) await this.store(stored, latest);
    const now = this.options.clock.now().getTime();
    const { cached } = this;
    if (cached?.from === latest && cached.expiresAt > now) return cached.accessToken;

    const token = await this.options.refresh(credentials, latest);
    const next = token.refreshToken ?? latest;
    this.cached = {
      from: next,
      accessToken: token.accessToken,
      expiresAt: now + usableFor(token.expiresInSeconds),
    };
    if (next !== stored) await this.store(stored, next);
    return token.accessToken;
  }

  private async store(replaced: string, token: string): Promise<void> {
    this.unsaved = { replaced, token };
    try {
      await this.save(replaced, token);
      if (this.unsaved.token === token) this.unsaved = undefined;
    } catch (error) {
      this.report(error);
    }
  }

  /** A listener that fails must not cost the caller the access token it was given. */
  private report(error: unknown): void {
    try {
      this.options.onTokenNotSaved?.(error);
    } catch {
      // The token is still kept and stored on the next call.
    }
  }

  private async save(replaced: string, token: string): Promise<void> {
    try {
      await this.options.saveRefreshToken(replaced, token);
    } catch {
      await this.options.saveRefreshToken(replaced, token);
    }
  }
}
