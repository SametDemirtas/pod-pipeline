import { Flex, Separator, Text } from '@radix-ui/themes';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { shippingChoice } from '@pod/rules';
import { familyLabel } from '../../shared/family-label.js';
import type { ChosenAi } from '../../shared/use-ai.js';
import type { ListingDraft } from './listing-draft.js';
import { ListingFormFooter } from './ListingFormFooter.js';
import { ListingTextSection } from './ListingTextSection.js';
import { PhotoChooser } from './PhotoChooser.js';
import { ShopSetupFields } from './ShopSetupFields.js';
import { SizePrices } from './SizePrices.js';
import { useDraftsCheck } from './use-drafts-check.js';
import { useCreateListing, useListingBusy } from './use-listing.js';
import { useListingDraftForm, type ListingDraftSources } from './use-listing-draft-form.js';
import { VariantChooser } from './VariantChooser.js';

interface ListingFormProps extends ListingDraftSources {
  readonly familyId: string;
  /** `null` when the design has none. */
  readonly designName: string | null;
  /** The service chosen to write and translate listing text. */
  readonly writer: ChosenAi;
}

/** Everything an Etsy draft needs, filled in by the seller and sent in one go. */
export function ListingForm(props: ListingFormProps) {
  const { t } = useTranslation();
  const form = useListingDraftForm(props);
  const { draft, update } = form;
  const create = useCreateListing(props.designId);
  const check = useDraftsCheck(props.designId, create.error);
  const busy = useListingBusy(props.designId) || check.pending;
  const problemsRef = useRef<HTMLDivElement>(null);

  const submit = () => {
    if (busy) return;
    if (form.ready) {
      // Prices typed in the old currency would mean something else in the new one.
      create.mutate(form.ready, () => {
        update({ price: '', sizePrices: {} });
      });
      return;
    }
    form.showProblems();
    // After the list renders, so screen readers hear what is missing.
    requestAnimationFrame(() => problemsRef.current?.focus());
  };

  return (
    <Flex asChild direction="column" gap="4">
      <form
        aria-label={t('listing.formLabel')}
        onSubmit={(event) => {
          event.preventDefault();
          // Enter in a field must not skip the question about a draft that may exist.
          if (!check.ask) submit();
        }}
      >
        <ListingTextSection
          designId={props.designId}
          familyId={props.familyId}
          designName={props.designName}
          shop={props.shop}
          writer={props.writer}
          draft={draft}
          descriptionLimit={form.descriptionLimit}
          invalid={form.invalid}
          onChange={update}
        />
        <Separator size="4" />
        <ListingVariants
          familyId={props.familyId}
          variants={props.variants}
          shop={props.shop}
          draft={draft}
          sizes={form.sizes}
          onChange={update}
        />
        <Separator size="4" />
        <ListingPhotos
          mockups={props.mockups}
          chosen={form.shown.mockupIds}
          aiNote={form.aiNote}
          onChange={update}
        />
        <Separator size="4" />
        <ShopSetupFields shop={props.shop} draft={draft} onChange={update} />
        {shippingChoice(props.shop, props.shippingProfileId).gone && (
          <ShippingProfileGone familyId={props.familyId} />
        )}
        <ListingFormFooter
          shop={props.shop}
          problems={form.problems}
          problemsRef={problemsRef}
          descriptionLimit={form.descriptionLimit}
          check={check}
          busy={busy}
          creating={create.isPending}
          createError={create.error}
          onCreate={submit}
        />
      </form>
    </Flex>
  );
}

function ShippingProfileGone({ familyId }: { familyId: string }) {
  const { t } = useTranslation();
  return (
    <Text size="2" color="amber" role="status">
      {t('listing.shippingProfileGone', { family: familyLabel(t, familyId) })}
    </Text>
  );
}

type ListingDraftForm = ReturnType<typeof useListingDraftForm>;

interface ListingVariantsProps {
  readonly familyId: string;
  readonly variants: ListingDraftSources['variants'];
  readonly shop: ListingDraftSources['shop'];
  readonly draft: ListingDraft;
  /** The sizes chosen; a price per size is offered once there are several. */
  readonly sizes: readonly string[];
  readonly onChange: (change: Partial<ListingDraft>) => void;
}

function ListingVariants({
  familyId,
  variants,
  shop,
  draft,
  sizes,
  onChange,
}: ListingVariantsProps) {
  return (
    <>
      <VariantChooser
        familyId={familyId}
        variants={variants}
        chosen={draft.variantIds}
        onChange={(variantIds) => {
          onChange({ variantIds });
        }}
      />
      {sizes.length > 1 && (
        <SizePrices
          sizes={sizes}
          prices={draft.sizePrices}
          shop={shop}
          onChange={(sizePrices) => {
            onChange({ sizePrices });
          }}
        />
      )}
    </>
  );
}

interface ListingPhotosProps {
  readonly mockups: ListingDraftSources['mockups'];
  readonly chosen: readonly string[];
  /** The note about AI the description gets, if any. */
  readonly aiNote: ListingDraftForm['aiNote'];
  readonly onChange: (change: Partial<ListingDraft>) => void;
}

function ListingPhotos({ mockups, chosen, aiNote, onChange }: ListingPhotosProps) {
  const { t } = useTranslation();
  return (
    <>
      {mockups.length > 0 ? (
        <PhotoChooser
          mockups={mockups}
          chosen={chosen}
          onChange={(mockupIds) => {
            onChange({ mockupIds });
          }}
        />
      ) : (
        <Text size="2" color="gray">
          {t('listing.noPhotos')}
        </Text>
      )}
      {aiNote && (
        <Text size="1" color="gray">
          {t(aiNote)}
        </Text>
      )}
    </>
  );
}
