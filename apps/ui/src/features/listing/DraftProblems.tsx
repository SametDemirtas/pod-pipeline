import type { Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { LISTING_LIMITS } from '@pod/rules';
import { FormProblems } from '../../shared/FormProblems.js';
import { formatPriceRange, priceRange, type ShopCurrency } from '../../shared/price.js';
import type { DraftField } from './listing-draft.js';

interface DraftProblemsProps {
  readonly problems: readonly DraftField[];
  readonly shop: ShopCurrency;
  readonly descriptionLimit: number;
  readonly ref?: Ref<HTMLDivElement>;
}

/** What still keeps the draft from being created, named the way the form names it. */
export function DraftProblems({ problems, shop, descriptionLimit, ref }: DraftProblemsProps) {
  const { t, i18n } = useTranslation();
  // Etsy's range is known only for dollar shops; other shops learn it from the price hint.
  const ranged = priceRange(shop) !== null;
  const values = {
    ...LISTING_LIMITS,
    description: descriptionLimit,
    ...formatPriceRange(i18n.language),
  };
  const key = (field: DraftField) => {
    if (ranged && field === 'price') return 'listing.problems.priceRange' as const;
    if (ranged && field === 'sizePrices') return 'listing.problems.sizePricesRange' as const;
    return `listing.problems.${field}` as const;
  };
  return (
    <FormProblems
      ref={ref}
      title={t('listing.problemsTitle')}
      problems={problems.map((field) => t(key(field), values))}
    />
  );
}
