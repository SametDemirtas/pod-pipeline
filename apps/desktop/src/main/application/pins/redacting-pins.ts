import type { Pin, PinRepository } from '@pod/core';
import { redact } from '../../shared/redact.js';

function withoutSecrets(pin: Pin): Pin {
  return pin.failure === null ? pin : { ...pin, failure: redact(pin.failure) };
}

/** The pins, with what a service said about a failed pin stored without the secrets it named. */
export function redactingPins(pins: PinRepository): PinRepository {
  return {
    save: (pin) => pins.save(withoutSecrets(pin)),
    get: (id) => pins.get(id),
    listForDesign: (designId) => pins.listForDesign(designId),
    listDue: (now) => pins.listDue(now),
    listByState: (state) => pins.listByState(state),
    remove: (id) => pins.remove(id),
  };
}
