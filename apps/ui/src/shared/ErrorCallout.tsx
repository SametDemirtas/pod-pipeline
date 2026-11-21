import { ExclamationTriangleIcon } from '@radix-ui/react-icons';
import { Button, Callout, Flex, Text } from '@radix-ui/themes';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '@pod/contracts/client';
import { apiErrorCode } from './api-error-code.js';
import { errorValues } from './error-values.js';

/** Codes whose reason helps the user fix the problem, e.g. which Etsy rule a title breaks. */
const DETAILED: ReadonlySet<string> = new Set([
  'CONNECTION_FAILED',
  'PROVIDER_FAILED',
  'PROVIDER_INTERRUPTED',
  'VALIDATION',
]);

interface ErrorCalloutProps {
  readonly error: unknown;
  readonly onRetry?: () => void;
  /** Shown under the message, e.g. a link to where the seller fixes the problem. */
  readonly children?: ReactNode;
}

/** Shows a translated, actionable message for any error the API can return. */
export function ErrorCallout({ error, onRetry, children }: ErrorCalloutProps) {
  const { t, i18n } = useTranslation();
  const code = apiErrorCode(error) ?? 'INTERNAL';
  const details = error instanceof ApiError ? error.details : {};
  const field = details['field'];
  const reason =
    typeof field === 'string' && typeof details['reason'] === 'string'
      ? `${field}: ${details['reason']}`
      : details['reason'];

  return (
    <Callout.Root color="red" role="alert">
      <Callout.Icon>
        <ExclamationTriangleIcon />
      </Callout.Icon>
      <Flex direction="column" gap="2" align="start">
        <Callout.Text>{t(`errors.${code}`, errorValues(i18n.language, details))}</Callout.Text>
        {DETAILED.has(code) && typeof reason === 'string' && (
          <Text size="1" asChild>
            <details>
              <summary>{t('errors.technicalDetails')}</summary>
              {reason}
            </details>
          </Text>
        )}
        {children}
        {onRetry && (
          <Button size="1" variant="soft" color="red" onClick={onRetry}>
            {t('errors.retry')}
          </Button>
        )}
      </Flex>
    </Callout.Root>
  );
}
