import { Flex } from '@radix-ui/themes';
import { useState } from 'react';
import type { ParseKeys } from 'i18next';
import { useTranslation } from 'react-i18next';
import type { ConnectS3Request } from '@pod/contracts/client';
import { ErrorCallout } from '../../../shared/ErrorCallout.js';
import { BusyButton } from '../../../shared/BusyButton.js';
import { SecretField } from './SecretField.js';
import { useConnectS3 } from './use-connection-calls.js';

type S3Fields = { [K in keyof ConnectS3Request]-?: string };

const EMPTY: S3Fields = {
  endpoint: '',
  region: 'auto',
  bucket: '',
  accessKeyId: '',
  secretAccessKey: '',
};

const FIELDS = [
  {
    key: 'endpoint',
    label: 'settings.connections.s3Endpoint',
    hint: 'settings.connections.s3EndpointHelp',
    plain: true,
  },
  { key: 'bucket', label: 'settings.connections.s3Bucket', plain: true },
  { key: 'region', label: 'settings.connections.s3Region', plain: true },
  { key: 'accessKeyId', label: 'settings.connections.s3AccessKeyId', plain: true },
  { key: 'secretAccessKey', label: 'settings.connections.s3SecretAccessKey', plain: false },
] as const satisfies readonly {
  key: keyof S3Fields;
  label: ParseKeys;
  hint?: ParseKeys;
  plain: boolean;
}[];

export function S3Form() {
  const { t } = useTranslation();
  const [fields, setFields] = useState(EMPTY);
  const connect = useConnectS3();
  const complete = Object.values(fields).every((value) => value.trim());

  return (
    <Flex direction="column" gap="3" align="start">
      <Flex asChild direction="column" gap="3" align="start">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            connect.mutate(fields);
          }}
        >
          {FIELDS.map((field) => (
            <SecretField
              key={field.key}
              id={`s3-${field.key}`}
              plain={field.plain}
              label={t(field.label)}
              hint={'hint' in field ? t(field.hint) : undefined}
              value={fields[field.key]}
              onChange={(value) => {
                setFields((current) => ({ ...current, [field.key]: value }));
              }}
            />
          ))}
          <BusyButton
            type="submit"
            busy={connect.isPending}
            loading={connect.isPending}
            disabled={!complete}
          >
            {t('settings.connections.connect')}
          </BusyButton>
        </form>
      </Flex>
      {connect.error && <ErrorCallout error={connect.error} />}
    </Flex>
  );
}
