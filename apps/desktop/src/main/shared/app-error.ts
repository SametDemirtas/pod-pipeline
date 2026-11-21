import type { ApiErrorCode } from '@pod/contracts';

/** The message of an error, or the value itself when something else was thrown. */
export function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** An error the app raises on purpose, with the API code clients translate. */
export class AppError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** The app is quitting and takes no new work. */
export class AppClosingError extends AppError {
  constructor() {
    super('APP_CLOSING', 'The app is closing');
  }
}
