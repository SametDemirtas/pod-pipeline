import { ValidationError } from '../errors.js';
import { assertDesignKey } from './keys.js';
import { IMAGE_MIME_TYPES, QUARTER_TURNS, type Design } from './model.js';

/** Rejects a design whose key, asset or dates no store could keep and read back. */
export function assertValidDesign(design: Design): void {
  assertDesignKey(design.designKey);
  const { asset } = design;
  requireInteger('width', asset.width, 1);
  requireInteger('height', asset.height, 1);
  requireInteger('byteSize', asset.byteSize, 0);
  if (!(IMAGE_MIME_TYPES as readonly string[]).includes(asset.mimeType)) {
    throw new ValidationError('mimeType', `"${asset.mimeType}" is not supported`);
  }
  const turn = design.rotation?.degrees;
  if (turn !== undefined && !(QUARTER_TURNS as readonly number[]).includes(turn)) {
    throw new ValidationError('rotation', `${String(turn)} is not a quarter turn`);
  }
  requireDate('createdAt', design.createdAt);
  requireDate('updatedAt', design.updatedAt);
}

function requireInteger(field: string, value: number, minimum: number): void {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new ValidationError(field, `must be an integer of at least ${minimum}`);
  }
}

function requireDate(field: string, value: Date): void {
  if (Number.isNaN(value.getTime())) throw new ValidationError(field, 'is not a valid date');
}
