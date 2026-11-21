import { busyFailure, serviceFailures, type ServiceFailure } from '@pod/adapter-http';

/** A model answered, but not with what the app asked for. */
export class AiAnswerError extends Error {
  constructor(
    readonly service: string,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** A model stopped before finishing because its service was short of servers; a later try may work. */
export class AiServiceBusyError extends Error {
  constructor(readonly service: string) {
    super(`${service} was too busy to finish; try again`);
    this.name = new.target.name;
  }
}

/** A failed answer from any model; `undefined` for errors its own adapter classifies. */
function classifyAiError(error: unknown): ServiceFailure | undefined {
  if (error instanceof AiServiceBusyError) return busyFailure(error.service);
  if (error instanceof AiAnswerError) {
    return { kind: 'failed', service: error.service, reason: error.message };
  }
  return undefined;
}

/** Names no service of its own: the failures name the model's service. */
export const AI_ANSWER_FAILURES = serviceFailures([], classifyAiError);
