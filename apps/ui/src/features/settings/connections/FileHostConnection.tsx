import { Flex, SegmentedControl, Text } from '@radix-ui/themes';
import { useState, type ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { FILE_HOST_KINDS, type ConnectionsDto, type FileHostKind } from '@pod/contracts/client';
import { ConnectionSection } from './ConnectionSection.js';
import { DropboxForm } from './DropboxForm.js';
import { S3Form } from './S3Form.js';

/** The form that connects each file host, and how a connected one is named. */
const FILE_HOSTS = {
  dropbox: { Form: DropboxForm, using: 'settings.connections.usingDropbox' },
  s3: { Form: S3Form, using: 'settings.connections.usingS3' },
} as const satisfies Record<FileHostKind, { Form: ComponentType; using: string }>;

/** Where Printful reads the print files from: the seller's Dropbox or an S3 bucket. */
export function FileHostConnection({ connections }: { connections: ConnectionsDto }) {
  const { t } = useTranslation();
  const [kind, setKind] = useState<FileHostKind>(FILE_HOST_KINDS[0]);
  const connectedAs =
    connections.fileHost === null ? null : t(FILE_HOSTS[connections.fileHost].using);

  return (
    <ConnectionSection
      service="fileHost"
      title={t('settings.connections.fileHostTitle')}
      connectedAs={connectedAs}
      intro={
        <Text size="2" color="gray">
          {t('settings.connections.fileHostHelp')}
        </Text>
      }
    >
      <Flex direction="column" gap="3" align="start">
        <SegmentedControl.Root
          value={kind}
          aria-label={t('settings.connections.fileHostKind')}
          onValueChange={(value) => {
            setKind(FILE_HOST_KINDS.find((known) => known === value) ?? FILE_HOST_KINDS[0]);
          }}
        >
          {FILE_HOST_KINDS.map((known) => (
            <SegmentedControl.Item key={known} value={known}>
              {t(`settings.connections.${known}`)}
            </SegmentedControl.Item>
          ))}
        </SegmentedControl.Root>
        {/* Every form stays mounted, so switching back keeps what was entered. */}
        {FILE_HOST_KINDS.map((known) => {
          const { Form } = FILE_HOSTS[known];
          return (
            <div key={known} hidden={kind !== known}>
              <Form />
            </div>
          );
        })}
      </Flex>
    </ConnectionSection>
  );
}
