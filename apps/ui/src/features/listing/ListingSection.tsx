import { Flex, Heading, Skeleton, Text } from '@radix-ui/themes';
import { useTranslation } from 'react-i18next';
import type { DesignDetailDto } from '@pod/contracts/client';
import { ConnectionNotice } from '../../shared/ConnectionNotice.js';
import { ErrorCallout } from '../../shared/ErrorCallout.js';
import { designTitle, familyLabel } from '../../shared/family-label.js';
import { LoadingStatus } from '../../shared/LoadingStatus.js';
import { useChosenAi } from '../../shared/use-ai.js';
import { useSettings } from '../../shared/use-settings.js';
import { isEtsyMissing, useShopOptions } from '../../shared/use-shop-options.js';
import { printRequest, usePrintCheck, type PrintChoice } from '../print/use-print.js';
import { useMockups } from '../mockups/use-mockups.js';
import { DraftPhotos } from './DraftPhotos.js';
import { ListingForm } from './ListingForm.js';
import { ListingStatus } from './ListingStatus.js';
import { LivePhotos } from './LivePhotos.js';
import { useListing } from './use-listing.js';
import { useBatchListingText } from './use-listing-text.js';

interface ListingSectionProps {
  readonly design: DesignDetailDto;
  readonly choice: PrintChoice;
}

/** The design's Etsy listing, or the form to create its draft. */
export function ListingSection({ design, choice }: ListingSectionProps) {
  const { t } = useTranslation();
  const listing = useListing(design.id);

  return (
    <Flex direction="column" gap="3">
      <Heading as="h2" size="4">
        {t('listing.heading')}
      </Heading>
      {listing.isPending && <Loading />}
      {listing.isError && (
        <ErrorCallout error={listing.error} onRetry={() => void listing.refetch()} />
      )}
      {listing.data && <ListingStatus listing={listing.data} />}
      {listing.data && <LivePhotos designId={design.id} />}
      {listing.data?.state === 'draft' && (
        <DraftPhotos designId={design.id} revision={design.revision} />
      )}
      {listing.data === null && <NewListing design={design} choice={choice} />}
    </Flex>
  );
}

function NewListing({ design, choice }: ListingSectionProps) {
  const { t, i18n } = useTranslation();
  const shop = useShopOptions(true);
  const check = usePrintCheck(printRequest(design.id, choice));
  const mockups = useMockups(design.id);
  const ai = useChosenAi();
  const settings = useSettings();
  // Text a batch job wrote; the form starts without it when it cannot be read.
  const prepared = useBatchListingText(design.id);

  if (isEtsyMissing(shop.error)) return <ConnectionNotice code="ETSY_NOT_CONNECTED" />;
  if (shop.isError) return <ErrorCallout error={shop.error} onRetry={() => void shop.refetch()} />;
  if (settings.isError) {
    return <ErrorCallout error={settings.error} onRetry={() => void settings.refetch()} />;
  }
  // The print check above shows the error and what to do about it.
  if (check.isError) {
    return (
      <Text size="2" color="gray">
        {t('listing.needsPrintCheck')}
      </Text>
    );
  }
  // A check still loading for a new choice would offer the previous choice's variants.
  if (
    !shop.data ||
    !settings.data ||
    !check.data ||
    check.isPlaceholderData ||
    !mockups.data ||
    !ai.loaded ||
    prepared.isPending
  ) {
    return <Loading />;
  }

  const area = check.data.printArea;
  // A listing sells one print, so variants that cannot take it on this area are left out.
  const printable = check.data.variants.filter((variant) =>
    variant.areas.some((candidate) => candidate.placement === area),
  );
  return (
    <>
      <Text size="2" color="gray">
        {t('listing.help')}
      </Text>
      <ListingForm
        key={`${area}:${design.revision}`}
        designId={design.id}
        familyId={design.familyId}
        revision={design.revision}
        choice={{ ...choice, printArea: area }}
        defaultTitle={designTitle(design.concept.name, familyLabel(t, design.familyId))}
        designName={design.concept.name}
        variants={printable}
        checkedVariantId={check.data.variantId}
        mockups={mockups.data}
        shop={shop.data}
        writer={ai.text}
        aiDesigns={settings.data.aiDesigns}
        shippingProfileId={settings.data.shippingProfiles[design.familyId]}
        sizes={settings.data.listingSizes[design.familyId]}
        prepared={prepared.data ?? null}
        prices={{
          listing: settings.data.listingPrices[design.familyId],
          sizes: settings.data.sizePrices[design.familyId],
          locale: i18n.language,
        }}
      />
    </>
  );
}

function Loading() {
  return (
    <LoadingStatus>
      <Skeleton height="120px" />
    </LoadingStatus>
  );
}
