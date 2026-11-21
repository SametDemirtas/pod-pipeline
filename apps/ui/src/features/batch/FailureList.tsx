import { Flex, Link, Text } from '@radix-ui/themes';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router';
import { isApiErrorCode, type ApiErrorPayload, type BatchFailureDto } from '@pod/contracts/client';
import { ConfirmDialog } from '../../shared/ConfirmDialog.js';
import { ErrorCallout } from '../../shared/ErrorCallout.js';
import { errorValues } from '../../shared/error-values.js';
import { familyLabel } from '../../shared/family-label.js';
import { useShopOptions } from '../../shared/use-shop-options.js';
import { formatList } from '../../shared/format.js';
import { BusyButton } from '../../shared/BusyButton.js';
import { retriable } from './batch-failures.js';
import { useConfirmDraftsChecked } from './use-batch.js';

/** Each design that stopped, with the step and what to do about it. */
export function FailureList({ failures }: { failures: readonly BatchFailureDto[] }) {
  const { t } = useTranslation();
  const checked = useConfirmDraftsChecked();
  const asksToCheck = failures.some((failure) => failure.draftCheck !== null);
  const draftsUrl = useShopOptions(asksToCheck).data?.draftsUrl;

  return (
    <Flex direction="column" gap="2">
      <Text as="p" size="2" weight="medium" id="batch-failures">
        {t('batch.failures')}
      </Text>
      {failures.length === 0 ? (
        <Text size="2" color="gray">
          {t('batch.noFailures')}
        </Text>
      ) : (
        <Flex asChild direction="column" gap="2">
          <ul aria-labelledby="batch-failures" style={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {failures.map((failure) => (
              <li key={failure.designId}>
                <Flex direction="column" align="start">
                  <Link asChild size="2" weight="medium">
                    <RouterLink to={`/designs/${failure.designId}`}>
                      {t('batch.failure', {
                        design: failure.designKey,
                        step: t(`batch.steps.${failure.step}`),
                      })}
                    </RouterLink>
                  </Link>
                  <Reason error={failure.error} />
                  {failure.draftCheck && retriable(failure) && (
                    <Reason error={failure.draftCheck} />
                  )}
                  {failure.draftCheck && (
                    <Flex gap="3" align="center" mt="1" wrap="wrap">
                      <ConfirmDialog
                        trigger={
                          <BusyButton
                            size="1"
                            variant="soft"
                            aria-label={t('batch.draftsCheckedLabel', {
                              design: failure.designKey,
                            })}
                            busy={checked.isPending && checked.variables === failure.designId}
                            loading={checked.isPending && checked.variables === failure.designId}
                          >
                            {t('batch.draftsChecked')}
                          </BusyButton>
                        }
                        title={t('common.draftsCheckTitle')}
                        description={t('common.draftsCheckBody')}
                        confirmLabel={t('common.draftsChecked')}
                        color="jade"
                        onConfirm={() => {
                          checked.mutate(failure.designId);
                        }}
                      />
                      {draftsUrl && (
                        <Link href={draftsUrl} target="_blank" rel="noreferrer" size="2">
                          {t('common.openDrafts')}
                        </Link>
                      )}
                    </Flex>
                  )}
                </Flex>
              </li>
            ))}
          </ul>
        </Flex>
      )}
      {checked.error !== null && <ErrorCallout error={checked.error} />}
    </Flex>
  );
}

function Reason({ error }: { error: ApiErrorPayload }) {
  const { t, i18n } = useTranslation();
  const code = isApiErrorCode(error.code) ? error.code : 'INTERNAL';
  const { familyId, size, sizes } = error.details;
  const named = typeof familyId === 'string' ? familyLabel(t, familyId) : '';
  const unpriced =
    Array.isArray(sizes) && sizes.length > 0
      ? ` (${formatList(sizes.map(String), i18n.language)})`
      : '';
  const family = `${named}${unpriced}`;

  return (
    <Text size="2" color="gray">
      {t(`errors.${code}`, { ...errorValues(i18n.language, error.details), family })}
      {typeof size === 'string' && ` ${t('batch.size', { size })}`}
    </Text>
  );
}
