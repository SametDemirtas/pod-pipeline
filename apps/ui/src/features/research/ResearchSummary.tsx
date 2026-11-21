import { DataList } from '@radix-ui/themes';
import { useTranslation } from 'react-i18next';
import type { KeywordReportDto } from '@pod/contracts/client';
import { formatMoney, formatShare } from '../../shared/format.js';

/** How crowded the search is and what buyers pay, from the first page of results. */
export function ResearchSummary({ report }: { report: KeywordReportDto }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const money = (amount: number, currency: string) => formatMoney(amount, currency, locale);
  const { prices } = report;

  return (
    <DataList.Root>
      <DataList.Item>
        <DataList.Label minWidth="180px">{t('research.results')}</DataList.Label>
        <DataList.Value>{report.resultsLabel ?? t('research.unknown')}</DataList.Value>
      </DataList.Item>
      <DataList.Item>
        <DataList.Label minWidth="180px">{t('research.prices')}</DataList.Label>
        <DataList.Value>
          {prices
            ? t('research.priceRange', {
                min: money(prices.min, prices.currency),
                median: money(prices.median, prices.currency),
                max: money(prices.max, prices.currency),
              })
            : t('research.unknown')}
        </DataList.Value>
      </DataList.Item>
      <DataList.Item>
        <DataList.Label minWidth="180px">{t('research.shares')}</DataList.Label>
        <DataList.Value>
          {t('research.shareValues', {
            listings: report.listingCount,
            ads: formatShare(report.adShare, locale),
            topSellers: formatShare(report.topSellerShare, locale),
            badges: formatShare(report.badgeShare, locale),
            shipping: formatShare(report.freeShippingShare, locale),
          })}
        </DataList.Value>
      </DataList.Item>
    </DataList.Root>
  );
}
