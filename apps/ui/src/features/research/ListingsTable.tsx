import { Badge, Flex, Heading, Table, Text } from '@radix-ui/themes';
import { useTranslation } from 'react-i18next';
import { type MarketListingDto } from '@pod/contracts/client';
import { isMarketBadge } from '@pod/rules';
import { formatMoney } from '../../shared/format.js';

/** What competitors sell under the query, as the first page showed it. */
export function ListingsTable({ listings }: { listings: readonly MarketListingDto[] }) {
  const { t, i18n } = useTranslation();
  const price = (listing: MarketListingDto) =>
    listing.price === null || listing.currency === null
      ? '–'
      : formatMoney(listing.price, listing.currency, i18n.language);

  return (
    <Flex direction="column" gap="2">
      <Heading as="h3" size="4">
        {t('research.listings')}
      </Heading>
      <Table.Root size="1" variant="surface">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeaderCell>{t('research.title')}</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>{t('research.shop')}</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell justify="end">{t('research.price')}</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>{t('research.signs')}</Table.ColumnHeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {listings.map((listing) => (
            <Table.Row key={listing.listingId}>
              <Table.RowHeaderCell>
                <Text size="1">{listing.title}</Text>
              </Table.RowHeaderCell>
              <Table.Cell>
                <Text size="1">{listing.shopName}</Text>
              </Table.Cell>
              <Table.Cell justify="end">{price(listing)}</Table.Cell>
              <Table.Cell>
                <Flex gap="1" wrap="wrap">
                  {listing.isAd && <Badge color="gray">{t('research.ad')}</Badge>}
                  {listing.isTopSeller && <Badge color="violet">{t('research.topSeller')}</Badge>}
                  {listing.freeShipping && <Badge color="jade">{t('research.freeShipping')}</Badge>}
                  {listing.badges.filter(isMarketBadge).map((badge) => (
                    <Badge key={badge} color="amber">
                      {t(`research.badges.${badge}`)}
                    </Badge>
                  ))}
                </Flex>
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
    </Flex>
  );
}
