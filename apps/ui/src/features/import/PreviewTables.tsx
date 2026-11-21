import { Badge, Flex, Heading, ScrollArea, Table, VisuallyHidden } from '@radix-ui/themes';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  IMPORT_IMAGE_LIMITS,
  type ImportItemStatusDto,
  type ImportPreviewItemDto,
  type SkippedFileDto,
} from '@pod/contracts/client';
import { familyLabel } from '../../shared/family-label.js';
import { useFamilies } from '../../shared/use-families.js';
import { formatList } from '../../shared/format.js';

const STATUS_COLORS: Record<ImportItemStatusDto, 'jade' | 'amber' | 'gray'> = {
  new: 'jade',
  changed: 'amber',
  unchanged: 'gray',
};

export function FoundDesignsTable({ items }: { items: readonly ImportPreviewItemDto[] }) {
  const { t } = useTranslation();
  return (
    <Section title={t('import.designsTitle')}>
      <Table.Root size="1">
        <HiddenHeader
          labels={[
            t('import.columns.code'),
            t('import.columns.concept'),
            t('import.columns.product'),
            t('import.columns.status'),
          ]}
        />
        <Table.Body>
          {items.map((item) => (
            <Table.Row key={item.designKey}>
              <Table.RowHeaderCell style={{ whiteSpace: 'nowrap' }}>
                {item.designKey}
              </Table.RowHeaderCell>
              <Table.Cell>{item.conceptName ?? t('import.unnamed')}</Table.Cell>
              <Table.Cell>{familyLabel(t, item.familyId)}</Table.Cell>
              <Table.Cell>
                <Badge color={STATUS_COLORS[item.status]} variant="soft">
                  {t(`import.status.${item.status}`)}
                </Badge>
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
    </Section>
  );
}

export function SkippedFilesTable({ files }: { files: readonly SkippedFileDto[] }) {
  const { t, i18n } = useTranslation();
  const families = useFamilies();
  const familyNames = formatList(
    (families.data ?? []).map((family) => familyLabel(t, family.id)),
    i18n.language,
    'disjunction',
  );

  return (
    <Section title={t('import.skippedTitle')}>
      <Table.Root size="1">
        <HiddenHeader labels={[t('import.columns.file'), t('import.columns.reason')]} />
        <Table.Body>
          {files.map((file) => (
            <Table.Row key={file.relativePath}>
              <Table.RowHeaderCell>{file.relativePath}</Table.RowHeaderCell>
              <Table.Cell>
                {t(`skipReasons.${file.reason}`, {
                  families: familyNames,
                  side: IMPORT_IMAGE_LIMITS.side,
                  megapixels: IMPORT_IMAGE_LIMITS.pixels / 1_000_000,
                })}
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
    </Section>
  );
}

function HiddenHeader({ labels }: { labels: readonly string[] }) {
  return (
    <Table.Header>
      <Table.Row>
        {labels.map((label) => (
          <Table.ColumnHeaderCell key={label} style={{ padding: 0, height: 0 }}>
            <VisuallyHidden>{label}</VisuallyHidden>
          </Table.ColumnHeaderCell>
        ))}
      </Table.Row>
    </Table.Header>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Flex direction="column" gap="2">
      <Heading as="h3" size="3">
        {title}
      </Heading>
      <ScrollArea type="auto" scrollbars="vertical" style={{ maxHeight: 220 }}>
        {children}
      </ScrollArea>
    </Flex>
  );
}
