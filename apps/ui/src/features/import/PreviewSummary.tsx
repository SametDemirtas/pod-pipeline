import { Badge, Callout, DataList, Flex, Text } from '@radix-ui/themes';
import { useTranslation } from 'react-i18next';
import type { ImportPreviewDto } from '@pod/contracts/client';
import { PathText } from '../../shared/PathText.js';
import { FoundDesignsTable, SkippedFilesTable } from './PreviewTables.js';

const COUNT_BADGES = [
  { count: 'new', label: 'import.countNew', color: 'jade' },
  { count: 'changed', label: 'import.countChanged', color: 'amber' },
  { count: 'unchanged', label: 'import.countUnchanged', color: 'gray' },
  { count: 'skipped', label: 'import.countSkipped', color: 'gray' },
] as const;

/** What the import would do, so the user can confirm with full knowledge. */
export function PreviewSummary({ preview }: { preview: ImportPreviewDto }) {
  const { t } = useTranslation();
  const borrowed = preview.items.filter((item) => item.borrowed).length;

  return (
    <Flex direction="column" gap="4">
      <DataList.Root orientation={{ initial: 'vertical', sm: 'horizontal' }} size="2">
        <DataList.Item>
          <DataList.Label>{t('import.folder')}</DataList.Label>
          <DataList.Value style={{ minWidth: 0 }}>
            <PathText path={preview.rootPath} folder />
          </DataList.Value>
        </DataList.Item>
      </DataList.Root>

      <Flex gap="2" wrap="wrap">
        {COUNT_BADGES.filter(({ count }) => preview.counts[count] > 0).map(
          ({ count, label, color }) => (
            <Badge key={count} color={color} size="2">
              {t(label, { count: preview.counts[count] })}
            </Badge>
          ),
        )}
      </Flex>

      {preview.conceptRenames.length > 0 && (
        <Callout.Root color="amber">
          <Flex direction="column" gap="1">
            <Text weight="medium">{t('import.renamedTitle')}</Text>
            {preview.conceptRenames.map((rename) => (
              <Callout.Text key={rename.conceptKey}>
                {rename.from === null
                  ? t('import.named', { key: rename.conceptKey, to: rename.to })
                  : t('import.renamed', {
                      key: rename.conceptKey,
                      from: rename.from,
                      to: rename.to,
                    })}
              </Callout.Text>
            ))}
          </Flex>
        </Callout.Root>
      )}

      {borrowed > 0 && (
        <Text size="2" color="gray">
          {t('import.samsungFromIphone', { count: borrowed })}
        </Text>
      )}
      {preview.items.length > 0 && <FoundDesignsTable items={preview.items} />}
      {preview.skipped.length > 0 && <SkippedFilesTable files={preview.skipped} />}
    </Flex>
  );
}
