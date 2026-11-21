import { Badge, Flex, Heading, Table, Text } from '@radix-ui/themes';
import { useTranslation } from 'react-i18next';
import type { KeywordReportDto } from '@pod/contracts/client';
import { CopyButton } from '../../shared/CopyButton.js';
import { formatShare } from '../../shared/format.js';
import { formatTags } from '../../shared/tags.js';

export function TermsTable({ report }: { report: KeywordReportDto }) {
  const { t, i18n } = useTranslation();
  const { terms, suggestedTags: tags } = report;

  return (
    <Flex direction="column" gap="2">
      <Flex justify="between" align="center" gap="3" wrap="wrap">
        <Heading as="h3" size="4">
          {t('research.terms')}
        </Heading>
        <CopyButton
          text={formatTags(tags)}
          label={t('research.copyTags')}
          disabled={tags.length === 0}
        />
      </Flex>
      <Text size="2" color="gray">
        {t('research.termsHelp')}
      </Text>
      {terms.length === 0 ? (
        <Text size="2">{t('research.noTerms')}</Text>
      ) : (
        <Table.Root size="1" variant="surface">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeaderCell>{t('research.term')}</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell justify="end">{t('research.used')}</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell justify="end">{t('research.inAds')}</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>{t('research.searched')}</Table.ColumnHeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {terms.map((term) => (
              <Table.Row key={term.term}>
                <Table.RowHeaderCell>
                  <Flex gap="2" align="center" wrap="wrap">
                    {term.term}
                    {term.trademark && (
                      <Badge color="red" variant="soft">
                        {t('research.trademark')}
                      </Badge>
                    )}
                  </Flex>
                </Table.RowHeaderCell>
                <Table.Cell justify="end">
                  {/* Its share counts results alone, which hardly use it, so none is shown. */}
                  {term.adOnly ? (
                    <Badge color="gray" variant="soft">
                      {t('research.adOnly')}
                    </Badge>
                  ) : (
                    t('research.usedBy', {
                      count: term.shops,
                      titles: term.listings,
                      share: formatShare(term.share, i18n.language),
                    })
                  )}
                </Table.Cell>
                <Table.Cell justify="end">{term.ads}</Table.Cell>
                <Table.Cell>
                  {term.suggested && (
                    <Badge color="jade" variant="soft">
                      {t('research.suggestedBadge')}
                    </Badge>
                  )}
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      )}
    </Flex>
  );
}
