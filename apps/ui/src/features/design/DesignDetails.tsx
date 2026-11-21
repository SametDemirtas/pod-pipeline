import { DataList, Flex, Grid, Heading, Text } from '@radix-ui/themes';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { type DesignDetailDto } from '@pod/contracts/client';
import { stepStatuses } from '@pod/rules';
import { DesignImage } from '../../shared/DesignImage.js';
import { designTitle, familyLabel } from '../../shared/family-label.js';
import { formatBytes, formatDate, formatPixels } from '../../shared/format.js';
import { PageHeading } from '../../shared/PageHeading.js';
import { PathText } from '../../shared/PathText.js';
import { useListing } from '../listing/use-listing.js';
import { usePins } from '../pins/use-pins.js';
import { usePrintProgress } from '../print/use-print.js';
import { DesignWorkspace } from './DesignWorkspace.js';
import { StepBar } from './StepBar.js';

// Breakpoints follow the window, not the content beside the sidebar, so two
// columns start only once there is room for both. The image column is only as
// wide as the image, so the details sit right beside it.
const COLUMNS = { initial: '1', md: 'minmax(0, max-content) minmax(240px, 1fr)' } as const;

export function DesignDetails({ design }: { design: DesignDetailDto }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const { asset } = design;
  const family = familyLabel(t, design.familyId);
  const progress = usePrintProgress(design.id, design.familyId);
  const listing = useListing(design.id);
  const pins = usePins(design.id);
  const pinned = pins.data?.some((pin) => pin.state === 'published') ?? false;

  return (
    <>
      <Flex direction="column" gap="1">
        <PageHeading>{design.designKey}</PageHeading>
        <Text color="gray">
          {design.concept.name === null
            ? family
            : t('design.subtitle', { concept: design.concept.name, family })}
        </Text>
      </Flex>
      <Grid columns={COLUMNS} gap="6" align="start">
        <DesignImage
          storageKey={asset.storageKey}
          width={1280}
          imageWidth={asset.width}
          imageHeight={asset.height}
          alt={designTitle(design.concept.name, family)}
          maxHeight="50vh"
        />
        <DataList.Root style={{ minWidth: 0 }}>
          <Detail label={t('design.size')}>
            {formatPixels(asset.width, asset.height, locale)}
          </Detail>
          <Detail label={t('design.fileSize')}>{formatBytes(asset.byteSize, locale)}</Detail>
          <Detail label={t('design.source')}>
            <PathText path={design.sourcePath} />
          </Detail>
        </DataList.Root>
      </Grid>
      <StepBar statuses={stepStatuses({ ...progress, listing: listing.data, pinned })} />
      <DesignWorkspace key={design.id} design={design} />
      <Flex direction="column" gap="2">
        <Heading as="h2" size="4">
          {t('design.revisions')}
        </Heading>
        <ul style={{ margin: 0, paddingLeft: 'var(--space-5)' }}>
          {design.revisions.map((revision) => (
            <li key={revision.revision}>
              <Text size="2" color="gray">
                {t('design.revisionEntry', {
                  revision: revision.revision,
                  date: formatDate(revision.recordedAt, locale),
                })}
              </Text>
            </li>
          ))}
        </ul>
      </Flex>
    </>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <DataList.Item>
      <DataList.Label minWidth="96px">{label}</DataList.Label>
      <DataList.Value style={{ minWidth: 0 }}>{children}</DataList.Value>
    </DataList.Item>
  );
}
