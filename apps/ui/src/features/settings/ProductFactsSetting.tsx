import { Flex, Heading, Skeleton, Text, TextField } from '@radix-ui/themes';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MAX_PRODUCT_FACT_LENGTH, type ProductFactsDto } from '@pod/contracts/client';
import { PRODUCT_FACTS } from '@pod/rules';
import { ErrorCallout } from '../../shared/ErrorCallout.js';
import { familyLabel } from '../../shared/family-label.js';
import { Field } from '../../shared/Field.js';
import { LabeledSelect } from '../../shared/LabeledSelect.js';
import { LoadingStatus } from '../../shared/LoadingStatus.js';
import { useChosenAi } from '../../shared/use-ai.js';
import { useSettings } from '../../shared/use-settings.js';
import { BusyButton } from '../../shared/BusyButton.js';
import { SavedStatus } from './SavedStatus.js';
import { useUpdateProductFacts } from './use-product-facts.js';

/** What listing text may state about each product, which the seller checks against Printful. */
export function ProductFactsSetting() {
  const { t } = useTranslation();
  const settings = useSettings();
  const { service } = useChosenAi().text;
  const facts = settings.data?.productFacts ?? {};
  const families = Object.keys(facts);
  const [chosen, setChosen] = useState<string | undefined>(undefined);
  const familyId = chosen ?? families[0];

  return (
    <Flex direction="column" gap="2">
      <Heading as="h2" size="4">
        {t('settings.facts.title')}
      </Heading>
      <Text size="2" color="gray">
        {t('settings.facts.help', { service })}
      </Text>
      <LabeledSelect
        label={t('settings.facts.product')}
        value={familyId}
        minWidth={240}
        options={families.map((id) => ({ value: id, label: familyLabel(t, id) }))}
        onChange={setChosen}
      />
      {familyId && facts[familyId] && (
        // Keyed, so switching products starts from that product's saved facts.
        <FactsForm key={familyId} familyId={familyId} saved={facts[familyId]} />
      )}
      {settings.isPending && (
        <LoadingStatus>
          <Skeleton height="96px" />
        </LoadingStatus>
      )}
      {settings.isError && (
        <ErrorCallout error={settings.error} onRetry={() => void settings.refetch()} />
      )}
    </Flex>
  );
}

function FactsForm({ familyId, saved }: { familyId: string; saved: ProductFactsDto }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(saved);
  const update = useUpdateProductFacts();

  return (
    <Flex asChild direction="column" gap="2">
      <form
        aria-label={t('settings.facts.title')}
        onSubmit={(event) => {
          event.preventDefault();
          update.mutate({ productFacts: { [familyId]: draft } });
        }}
      >
        {PRODUCT_FACTS.map((fact) => (
          <Field key={fact} id={`facts-${fact}`} label={t(`common.facts.${fact}`)}>
            {() => (
              <TextField.Root
                id={`facts-${fact}`}
                value={draft[fact]}
                maxLength={MAX_PRODUCT_FACT_LENGTH}
                onChange={(event) => {
                  update.reset();
                  setDraft((current) => ({ ...current, [fact]: event.target.value }));
                }}
              />
            )}
          </Field>
        ))}
        <Flex align="center" gap="3">
          <BusyButton
            type="submit"
            variant="soft"
            busy={update.isPending}
            loading={update.isPending}
          >
            {t('settings.facts.save')}
          </BusyButton>
          <SavedStatus saved={update.isSuccess} />
        </Flex>
        {update.isError && <ErrorCallout error={update.error} />}
      </form>
    </Flex>
  );
}
