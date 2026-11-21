import { AI_ANSWER_FAILURES } from '@pod/adapter-ai';
import { CLAUDE_FAILURES } from '@pod/adapter-anthropic';
import {
  ETSY_FAILURES,
  EtsyCurrencyChangedError,
  EtsyDraftUnconfirmedError,
} from '@pod/adapter-etsy';
import { FILE_HOST_FAILURES } from '@pod/adapter-file-hosts';
import { GEMINI_FAILURES } from '@pod/adapter-gemini';
import type { ServiceFailures } from '@pod/adapter-http';
import { OPENAI_COMPATIBLE_FAILURES } from '@pod/adapter-openai';
import { PINTEREST_FAILURES, PinterestPublishUncertainError } from '@pod/adapter-pinterest';
import { PRINTFUL_FAILURES } from '@pod/adapter-printful';
import {
  AiNotConnectedError,
  EtsyNotConnectedError,
  FileHostNotConnectedError,
  PinterestNotConnectedError,
  PrintfulNotConnectedError,
} from '../application/errors/connection-errors.js';
import {
  DraftMayExistError,
  ShopCurrencyChangedError,
} from '../application/errors/listing-errors.js';
import { PinSentUnconfirmedError } from '../application/errors/pin-errors.js';

/** An adapter's errors, with how the app tells the seller about them. */
interface Provider<S extends string> extends ServiceFailures<S> {
  /** What the seller is asked to connect again when the service refuses its sign-in or key. */
  readonly notConnected: (service: string) => Error;
  /** The app error for an outcome of the adapter's own, e.g. a draft that may exist; else `undefined`. */
  readonly outcome?: (error: unknown) => Error | undefined;
}

const aiNotConnected = (service: string) => new AiNotConnectedError(service);

function etsyOutcome(error: unknown): Error | undefined {
  if (error instanceof EtsyDraftUnconfirmedError) return new DraftMayExistError();
  if (error instanceof EtsyCurrencyChangedError) return new ShopCurrencyChangedError(error.current);
  return undefined;
}

function pinterestOutcome(error: unknown): Error | undefined {
  return error instanceof PinterestPublishUncertainError
    ? new PinSentUnconfirmedError(error.message)
    : undefined;
}

/** Every adapter that reaches an outside service; the first that recognises an error decides. */
export const PROVIDERS = [
  { ...PRINTFUL_FAILURES, notConnected: () => new PrintfulNotConnectedError() },
  { ...FILE_HOST_FAILURES, notConnected: () => new FileHostNotConnectedError() },
  { ...ETSY_FAILURES, notConnected: () => new EtsyNotConnectedError(), outcome: etsyOutcome },
  {
    ...PINTEREST_FAILURES,
    notConnected: () => new PinterestNotConnectedError(),
    outcome: pinterestOutcome,
  },
  { ...GEMINI_FAILURES, notConnected: aiNotConnected },
  { ...CLAUDE_FAILURES, notConnected: aiNotConnected },
  { ...OPENAI_COMPATIBLE_FAILURES, notConnected: aiNotConnected },
  { ...AI_ANSWER_FAILURES, notConnected: aiNotConnected },
] as const satisfies readonly Provider<string>[];

/** The name of an outside service as the seller knows it, e.g. `Printful` or `Claude`. */
export type ProviderName = (typeof PROVIDERS)[number]['services'][number];
