import type { SignInService } from '@pod/contracts';

/** Sign-ins waiting for the seller in the browser, so they can be cancelled. */
export class BrowserSignIns {
  private readonly pending = new Map<SignInService, AbortController>();

  /**
   * Runs `signIn` with a signal that a cancel aborts, failing with
   * `cancelled()` once it was cancelled.
   */
  async run<T>(
    service: SignInService,
    signIn: (signal: AbortSignal) => Promise<T>,
    cancelled: () => Error,
  ): Promise<T> {
    const pending = new AbortController();
    this.pending.set(service, pending);
    try {
      return await signIn(pending.signal);
    } catch (error) {
      // A cancel during the token exchange or a lookup fails as an aborted request.
      throw pending.signal.aborted ? cancelled() : error;
    } finally {
      if (this.pending.get(service) === pending) this.pending.delete(service);
    }
  }

  cancel(service: SignInService): void {
    this.pending.get(service)?.abort();
  }

  cancelAll(): void {
    for (const pending of this.pending.values()) pending.abort();
  }
}
