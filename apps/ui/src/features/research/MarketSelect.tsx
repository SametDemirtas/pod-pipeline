import { useTranslation } from 'react-i18next';
import type { ResearchMarket } from '@pod/contracts/client';
import { LabeledSelect } from '../../shared/LabeledSelect.js';
import { marketOptions } from '../../shared/market-label.js';

interface MarketSelectProps {
  /** Read by screen readers; the select sits in a row with what it is for. */
  readonly label: string;
  readonly value: ResearchMarket;
  readonly onChange: (market: ResearchMarket) => void;
}

/** Chooses the Etsy market to search or to file a keyword list under. */
export function MarketSelect({ label, value, onChange }: MarketSelectProps) {
  const { t } = useTranslation();
  return (
    <LabeledSelect
      label={label}
      hideLabel
      value={value}
      options={marketOptions(t)}
      minWidth={0}
      onChange={onChange}
    />
  );
}
