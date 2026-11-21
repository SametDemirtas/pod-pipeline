import type { SignInService } from '@pod/contracts';

/**
 * Services whose renewed sign-in could not be saved. They work until the app
 * quits, but may need connecting again after it starts anew.
 */
export class UnsavedSignIns {
  private readonly services = new Set<SignInService>();

  /** Notes the failure, logged without its secrets. */
  failed(service: SignInService, error: unknown, logError: (error: unknown) => void): void {
    this.services.add(service);
    logError(error);
  }

  /** The service was connected or disconnected again, which settles it. */
  settled(service: SignInService): void {
    this.services.delete(service);
  }

  list(): SignInService[] {
    return [...this.services];
  }
}
