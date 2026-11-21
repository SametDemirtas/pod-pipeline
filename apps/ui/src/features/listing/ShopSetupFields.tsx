import { InfoCircledIcon } from '@radix-ui/react-icons';
import { Callout, Flex } from '@radix-ui/themes';
import { useTranslation } from 'react-i18next';
import type { ShopOptionsDto } from '@pod/contracts/client';
import { toggledIn } from '../../shared/collections.js';
import { asOptions, LabeledSelect } from '../../shared/LabeledSelect.js';
import { CheckList } from './CheckList.js';
import type { ListingDraft } from './listing-draft.js';

type SetupPart = Pick<
  ListingDraft,
  'shippingProfileId' | 'readinessStateId' | 'returnPolicyId' | 'productionPartnerIds'
>;

interface ShopSetupFieldsProps {
  readonly shop: ShopOptionsDto;
  readonly draft: SetupPart;
  readonly onChange: (change: Partial<SetupPart>) => void;
}

/** Radix Select needs a value for "none"; an empty string is not allowed. */
const NONE = 'none';

export function ShopSetupFields({ shop, draft, onChange }: ShopSetupFieldsProps) {
  const { t } = useTranslation();

  return (
    <Flex direction="column" gap="3">
      {shop.shippingProfiles.length === 0 && <Notice text={t('listing.noShippingProfile')} />}
      {shop.productionPartners.length === 0 && <Notice text={t('listing.noProductionPartner')} />}
      <Flex gap="4" wrap="wrap">
        <LabeledSelect
          label={t('listing.shippingProfile')}
          options={asOptions(shop.shippingProfiles)}
          value={draft.shippingProfileId || undefined}
          onChange={(shippingProfileId) => {
            onChange({ shippingProfileId });
          }}
        />
        <LabeledSelect
          label={t('listing.readinessState')}
          options={asOptions(shop.readinessStates)}
          value={draft.readinessStateId || undefined}
          onChange={(readinessStateId) => {
            onChange({ readinessStateId });
          }}
        />
        <LabeledSelect
          label={t('listing.returnPolicy')}
          options={[
            { value: NONE, label: t('listing.noReturnPolicy') },
            ...asOptions(shop.returnPolicies),
          ]}
          value={draft.returnPolicyId || NONE}
          onChange={(value) => {
            onChange({ returnPolicyId: value === NONE ? '' : value });
          }}
        />
      </Flex>
      {shop.productionPartners.length > 0 && (
        <CheckList
          label={t('listing.productionPartners')}
          options={shop.productionPartners.map((partner) => ({
            value: partner.id,
            label: partner.label,
          }))}
          checked={new Set(draft.productionPartnerIds)}
          onToggle={(id, on) => {
            onChange({ productionPartnerIds: toggledIn(draft.productionPartnerIds, id, on) });
          }}
        />
      )}
    </Flex>
  );
}

function Notice({ text }: { text: string }) {
  return (
    <Callout.Root color="amber" size="1">
      <Callout.Icon>
        <InfoCircledIcon />
      </Callout.Icon>
      <Callout.Text>{text}</Callout.Text>
    </Callout.Root>
  );
}
