import type { PrintAreaDto, PrintCheckDto, PrintRequest } from '@pod/contracts/client';
import type { z } from 'zod';
import { DESIGN, inputs } from '../schemas.js';

/** What the print tools take: the design, and which variant, area and fit to show. */
export const PRINT_INPUT = {
  ...DESIGN,
  variant_id: inputs.variantId
    .optional()
    .describe('Variant id from check_print; the first variant when left out'),
  print_area: inputs.printArea
    .optional()
    .describe(
      "Print area from the variant's areas in check_print, e.g. front or back; the first when left out",
    ),
  fit: inputs.fit.describe('contain shows the whole design; cover fills the area and crops'),
};

export type PrintToolInput = z.infer<z.ZodObject<typeof PRINT_INPUT>>;

export function printRequestOf(input: PrintToolInput): PrintRequest {
  return {
    designId: input.design_id,
    variantId: input.variant_id,
    printArea: input.print_area,
    fit: input.fit,
  };
}

/**
 * Shirts come in hundreds of colour and size variants, so each variant is
 * listed with only the names of its print areas; the checked area comes in full.
 */
export type CompactPrintCheck = Omit<PrintCheckDto, 'variants'> & {
  /** Size of the checked print area, which `placement` is measured in. */
  readonly area: PrintAreaDto | null;
  readonly variants: readonly (Omit<PrintCheckDto['variants'][number], 'areas'> & {
    readonly areas: readonly string[];
  })[];
};

export function compactPrintCheck(check: PrintCheckDto): CompactPrintCheck {
  const checked = check.variants.find((variant) => variant.id === check.variantId);
  return {
    ...check,
    area: checked?.areas.find((area) => area.placement === check.printArea) ?? null,
    variants: check.variants.map(({ areas, ...variant }) => ({
      ...variant,
      areas: areas.map((area) => area.placement),
    })),
  };
}
