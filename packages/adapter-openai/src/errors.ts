import OpenAI from 'openai';
import type { OpenAiVendor } from './vendors.js';

/** No API key has been saved yet for an OpenAI-compatible service. */
export class OpenAiNotConnectedError extends Error {
  readonly service: string;

  constructor(vendor: OpenAiVendor) {
    super(`${vendor.service} is not connected; add ${vendor.keyName} first`);
    this.service = vendor.service;
    this.name = new.target.name;
  }
}

/** An error from the SDK, which cannot tell vendors apart, with the service that raised it. */
export class OpenAiVendorError extends Error {
  constructor(
    readonly service: string,
    cause: Error,
  ) {
    super(cause.message, { cause });
    this.name = new.target.name;
  }
}

/**
 * A scene was asked for and the service failed on its side, which may come
 * after the scene was made: it may still be billed.
 */
export class OpenAiSceneUnfinishedError extends Error {
  constructor(
    readonly service: string,
    cause: Error,
  ) {
    super(`${service} did not finish the scene: no answer`, { cause });
    this.name = new.target.name;
  }
}

/** Runs `request`, tagging the SDK's errors with the vendor's service. */
export async function asVendor<T>(vendor: OpenAiVendor, request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    if (error instanceof OpenAI.APIError) throw new OpenAiVendorError(vendor.service, error);
    throw error;
  }
}
