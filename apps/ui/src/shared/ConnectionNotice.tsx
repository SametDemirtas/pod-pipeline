import { InfoCircledIcon } from '@radix-ui/react-icons';
import { Button, Callout, Flex } from '@radix-ui/themes';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { ApiErrorCode } from '@pod/contracts/client';
import { errorValues } from './error-values.js';

export interface ConnectionNoticeProps {
  readonly code: ApiErrorCode;
  /** What the error told, e.g. which AI service has no key. */
  readonly details?: Readonly<Record<string, unknown>>;
  /** Said instead of the error's text, e.g. what connecting the service would give. */
  readonly message?: string;
}

/** A missing connection is a setup step, not a failure, so it is shown calmly. */
export function ConnectionNotice({ code, details, message }: ConnectionNoticeProps) {
  const { t, i18n } = useTranslation();

  return (
    <Flex direction="column" gap="2" align="start">
      <Callout.Root color="gray" role="status">
        <Callout.Icon>
          <InfoCircledIcon />
        </Callout.Icon>
        <Callout.Text>
          {message ?? t(`errors.${code}`, errorValues(i18n.language, details))}
        </Callout.Text>
      </Callout.Root>
      <Button variant="soft" asChild>
        <Link to="/settings">{t('common.openSettings')}</Link>
      </Button>
    </Flex>
  );
}
