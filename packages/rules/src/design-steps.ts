import type { ListingDto } from '@pod/contracts/client';

export const DESIGN_STEPS = [
  'design',
  'check',
  'mockups',
  'text',
  'listing',
  'fulfilment',
  'publish',
  'pins',
] as const;

export type DesignStep = (typeof DESIGN_STEPS)[number];
/** `open` steps can be done now; `upcoming` ones need an earlier step first. */
export type StepStatus = 'done' | 'open' | 'upcoming';

export interface DesignProgress {
  /** The design's product can be printed, and the print provider is connected. */
  readonly printable: boolean;
  /** The print check came back without a blurry rating. */
  readonly checked: boolean;
  readonly hasMockups: boolean;
  /** `undefined` while it is being looked up. */
  readonly listing: Pick<ListingDto, 'state' | 'linkCurrent'> | null | undefined;
  /** At least one of the design's pins is published. */
  readonly pinned: boolean;
}

/** Where a design stands in the pipeline. */
export function stepStatuses(progress: DesignProgress): Readonly<Record<DesignStep, StepStatus>> {
  const { printable, checked, hasMockups, listing, pinned } = progress;
  const listed: StepStatus = listing
    ? 'done'
    : hasMockups && listing === null
      ? 'open'
      : 'upcoming';
  return {
    design: 'done',
    check: checked ? 'done' : printable ? 'open' : 'upcoming',
    mockups: hasMockups ? 'done' : printable ? 'open' : 'upcoming',
    // Listing text is saved with the draft, so it shares the listing step.
    text: listed,
    listing: listed,
    // A design changed after linking is linked again before it can be published.
    fulfilment: listing?.linkCurrent ? 'done' : listing ? 'open' : 'upcoming',
    publish: listing?.state === 'active' ? 'done' : listing?.linkCurrent ? 'open' : 'upcoming',
    pins: pinned ? 'done' : hasMockups ? 'open' : 'upcoming',
  };
}
