import { Callout, Flex, Heading } from '@radix-ui/themes';
import { InfoCircledIcon } from '@radix-ui/react-icons';
import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import type { DesignDetailDto, PrintVariantDto } from '@pod/contracts/client';
import { MockupsSection } from '../mockups/MockupsSection.js';
import { PrintCheckResult } from './PrintCheckResult.js';
import { PrintOptions } from './PrintOptions.js';
import { RotateArtwork } from './RotateArtwork.js';
import { UpscaleArtwork } from './UpscaleArtwork.js';
import {
  isNotFound,
  isUnavailable,
  printRequest,
  usePrintCheck,
  type PrintChoice,
} from './use-print.js';

interface PrintWorkspaceProps {
  readonly design: DesignDetailDto;
  /** Shared with the listing, which prints what was checked here. */
  readonly choice: PrintChoice;
  readonly onChoiceChange: (choice: PrintChoice) => void;
}

/** Print check and mockups for one design; both use the chosen variant, area and fit. */
export function PrintWorkspace({ design, choice, onChoiceChange }: PrintWorkspaceProps) {
  const { t } = useTranslation();
  const { variantId, printArea, fit } = choice;
  const change = (next: Partial<PrintChoice>) => {
    onChoiceChange({ ...choice, ...next });
  };
  const [variants, setVariants] = useState<readonly PrintVariantDto[]>([]);
  const check = usePrintCheck(printRequest(design.id, choice));

  // Keep the last known variants, so a failed check never takes the choice away.
  if (check.data && check.data.variants !== variants) setVariants(check.data.variants);
  // Forget the narrower choice first: an area may be gone while the variant still exists.
  const notFound = isNotFound(check.error);
  useEffect(() => {
    if (!notFound) return;
    if (printArea !== undefined) onChoiceChange({ ...choice, printArea: undefined });
    else if (variantId !== undefined) onChoiceChange({ ...choice, variantId: undefined });
  }, [notFound, choice, printArea, variantId, onChoiceChange]);

  if (isUnavailable(check.error)) return <ProductUnavailable />;

  const chosenId = variantId ?? check.data?.variantId;
  const variant = variants.find((candidate) => candidate.id === chosenId) ?? variants[0];
  const area = printArea ?? areaFor(variant, check.data?.printArea);
  const upToDate = check.isSuccess && !check.isPlaceholderData;

  const chooseVariant = (id: string) => {
    const next = variants.find((candidate) => candidate.id === id);
    // Another variant may lack the chosen area, e.g. a shirt printed only on the front.
    const keepsArea = next?.areas.some((candidate) => candidate.placement === area) === true;
    change({ variantId: id, printArea: keepsArea ? printArea : undefined });
  };

  return (
    <>
      <Flex direction="column" gap="3">
        <Heading as="h2" size="4">
          {t('print.title')}
        </Heading>
        {variant && area !== undefined && (
          <PrintOptions
            familyId={design.familyId}
            variants={variants}
            variant={variant}
            printArea={area}
            fit={fit}
            onVariantChange={chooseVariant}
            onPrintAreaChange={(next) => {
              change({ printArea: next });
            }}
            onFitChange={(next) => {
              change({ fit: next });
            }}
          />
        )}
        <PrintCheckResult check={check} storageKey={design.asset.storageKey} />
        <UpscaleArtwork design={design} blurry={upToDate && check.data.quality === 'poor'} />
        <RotateArtwork design={design} turnsToFit={upToDate && check.data.turnsToFit} />
      </Flex>
      <MockupsSection
        request={printRequest(design.id, { variantId: variant?.id, printArea: area, fit })}
        canCreate={upToDate}
        checkFailed={check.isError}
        variants={variants}
        designKey={design.designKey}
        familyId={design.familyId}
        revision={design.revision}
      />
    </>
  );
}

/** The area the check settled on; while another variant loads, it may name one this variant lacks. */
function areaFor(
  variant: PrintVariantDto | undefined,
  checkedArea: string | undefined,
): string | undefined {
  return variant?.areas.some((candidate) => candidate.placement === checkedArea)
    ? checkedArea
    : variant?.areas[0]?.placement;
}

function ProductUnavailable() {
  const { t } = useTranslation();
  return (
    <Callout.Root color="gray">
      <Callout.Icon>
        <InfoCircledIcon />
      </Callout.Icon>
      <Callout.Text>{t('errors.PRINT_PRODUCT_UNAVAILABLE')}</Callout.Text>
    </Callout.Root>
  );
}
