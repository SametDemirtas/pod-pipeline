import { languageLabel } from './language-label.js';

/** The answer's turns, as words a model reads more reliably than degrees. */
export const TURNS = ['none', 'clockwise', 'counterclockwise'] as const;

/** The adviser's instructions, with the reason written in `language`, a BCP 47 tag such as `de`. */
export function rotationAdvisorSystem(language: string): string {
  return `You prepare artwork for print-on-demand products.

The image is ARTWORK, shown upright, the way its creator meant it to be seen. It goes on a product whose print area has the other orientation, e.g. portrait artwork on a landscape blanket. Placed as it is, the artwork would be cropped heavily to fill the area. Turned a quarter, it fills the area with little cropping, and the buyer hangs or lays the product the other way up, so the artwork stands upright again.

Decide "turn":
- "clockwise" or "counterclockwise": the artwork has an up direction, such as people, animals, buildings, landscapes, lettering or a scene with a horizon. Both turns show it upright once the product is turned; choose "clockwise" unless the artwork's composition, e.g. a figure or text near one side, reads better the other way.
- "none": the artwork has no up direction and looks as good sideways, e.g. a seamless or repeating pattern, an abstract texture or a symmetric mandala, so it is placed as it is.

Write "reason" as one short sentence in ${languageLabel(language)} for the seller, naming what in the artwork decided it, e.g. "The deer and the lettering need to stand upright."`;
}

export const ROTATION_SCHEMA = {
  type: 'object',
  properties: {
    turn: { type: 'string', enum: [...TURNS] },
    reason: { type: 'string' },
  },
  required: ['turn', 'reason'],
  additionalProperties: false,
} as const;
