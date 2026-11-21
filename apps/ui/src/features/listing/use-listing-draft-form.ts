import { useState } from 'react';
import {
  type BatchListingTextDto,
  type MockupDto,
  type PrintVariantDto,
  type ShopOptionsDto,
} from '@pod/contracts/client';
import { aiNoteKind, descriptionLimit, type AiNoteKind } from '@pod/rules';
import { allSizesOf } from '../../shared/variant-options.js';
import type { PrintChoice } from '../print/use-print.js';
import { toCreateRequest } from './create-request.js';
import { withShownSizePrices, type SavedPrices } from './draft-prices.js';
import { draftProblems } from './draft-validation.js';
import { initialDraft } from './initial-draft.js';
import { withLivePhotos, type DraftField, type ListingDraft } from './listing-draft.js';

export interface ListingDraftSources {
  readonly designId: string;
  readonly revision: number;
  /** The print check's choice, with the print area it settled on. */
  readonly choice: PrintChoice & { readonly printArea: string };
  readonly defaultTitle: string;
  readonly variants: readonly PrintVariantDto[];
  readonly checkedVariantId: string;
  readonly mockups: readonly MockupDto[];
  readonly shop: ShopOptionsDto;
  readonly aiDesigns: boolean;
  readonly shippingProfileId: string | undefined;
  readonly sizes: readonly string[] | undefined;
  /** Text a batch job wrote for the design; `null` when it wrote none. */
  readonly prepared: BatchListingTextDto | null;
  /** The product's prices from the settings, which the price fields start with. */
  readonly prices?: SavedPrices | undefined;
}

/** The i18n key of what the seller is told about a note on AI. */
const AI_NOTE_TEXT = {
  both: 'listing.aiNoteBoth',
  designs: 'listing.aiDesignNote',
  scenes: 'listing.aiSceneNote',
} as const satisfies Record<AiNoteKind, string>;

/**
 * The draft as typed, what it shows and the request it makes, if complete.
 * Problems show once the seller tried to create the draft.
 */
export function useListingDraftForm(sources: ListingDraftSources) {
  const [draft, setDraft] = useState<ListingDraft>(() =>
    initialDraft({
      title: sources.defaultTitle,
      revision: sources.revision,
      variants: sources.variants,
      variantId: sources.checkedVariantId,
      printArea: sources.choice.printArea,
      mockups: sources.mockups,
      shop: sources.shop,
      shippingProfileId: sources.shippingProfileId,
      sizes: sources.sizes,
      prepared: sources.prepared,
      prices: sources.prices,
    }),
  );
  const [checked, setChecked] = useState(false);
  const chosen = new Set(draft.variantIds);
  const sizes = allSizesOf(sources.variants.filter((variant) => chosen.has(variant.id)));
  const shown = withLivePhotos(withShownSizePrices(draft, sizes), sources.mockups);
  const scenes = sources.mockups.some(
    (mockup) => mockup.scenePrompt !== null && shown.mockupIds.includes(mockup.id),
  );
  const note = aiNoteKind({ scenes, designs: sources.aiDesigns });
  const limits = { description: descriptionLimit(note), variants: sources.variants };
  const problems = checked ? draftProblems(shown, sources.shop, limits) : [];
  return {
    draft,
    shown,
    sizes,
    aiNote: note && AI_NOTE_TEXT[note],
    descriptionLimit: limits.description,
    ready: toCreateRequest(sources.designId, sources.choice, shown, sources.shop, limits),
    problems,
    invalid: new Set<DraftField>(problems),
    showProblems: () => {
      setChecked(true);
    },
    update: (change: Partial<ListingDraft>) => {
      setDraft((current) => ({ ...current, ...change }));
    },
  };
}
