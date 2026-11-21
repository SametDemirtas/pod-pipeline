import type { SceneProblems } from '@pod/core';
import { AiNotConnectedError } from '../errors/connection-errors.js';
import {
  ProviderBusyError,
  ProviderFailedError,
  ProviderInterruptedError,
} from '../errors/provider-errors.js';

/**
 * Logs what scenes go on without; provider trouble is expected and shown to
 * the seller, anything else is worth a look.
 */
export function sceneProblems(logError: (error: unknown) => void): SceneProblems {
  return {
    stepFailed: (error) => {
      if (!isProviderTrouble(error)) logError(error);
    },
    removalFailed: logError,
  };
}

/** A missing key, or a failed, busy, unreachable or broken-off service. */
function isProviderTrouble(error: unknown): boolean {
  return (
    error instanceof ProviderFailedError ||
    error instanceof ProviderInterruptedError ||
    error instanceof ProviderBusyError ||
    error instanceof AiNotConnectedError
  );
}
