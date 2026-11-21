/** The name the seller knows the service by, in errors and messages. */
export const GEMINI = 'Gemini';

/** No Gemini API key has been saved yet. */
export class GeminiNotConnectedError extends Error {
  constructor() {
    super(`${GEMINI} is not connected; add a ${GEMINI} API key first`);
    this.name = new.target.name;
  }
}

export interface GeminiErrorDetails {
  /** HTTP status, when Gemini answered with one. */
  readonly status?: number | undefined;
  /** Google's machine-readable reason, such as `API_KEY_INVALID`. */
  readonly reason?: string | undefined;
  /** How long Google asked to wait before trying again. */
  readonly retryAfterSeconds?: number | undefined;
  /** A daily or free-tier quota is used up, which waiting minutes does not cure. */
  readonly quotaUsedUp?: boolean | undefined;
}

/** Gemini answered with an error, or without an image. */
export class GeminiError extends Error {
  readonly status: number | undefined;
  readonly reason: string | undefined;
  readonly retryAfterSeconds: number | undefined;
  readonly quotaUsedUp: boolean;

  constructor(message: string, details: GeminiErrorDetails = {}) {
    super(message);
    this.name = new.target.name;
    this.status = details.status;
    this.reason = details.reason;
    this.retryAfterSeconds = details.retryAfterSeconds;
    this.quotaUsedUp = details.quotaUsedUp ?? false;
  }
}

/** Gemini answered with a success that was not the JSON it documents. */
export class GeminiUnreadableAnswerError extends GeminiError {
  constructor() {
    super(`${GEMINI} sent an answer that could not be read`);
  }
}

/**
 * A scene was asked for and its outcome is unknown: it did not finish in time,
 * or Google could no longer be asked about it. It may still be made and billed.
 */
export class GeminiSceneUnfinishedError extends Error {
  constructor(
    /** Why the outcome is unknown, e.g. `timed out`. */
    readonly reason = 'timed out',
    cause?: unknown,
  ) {
    super(`${GEMINI} did not finish the scene: ${reason}`, { cause });
    this.name = new.target.name;
  }
}
