import { ImageIcon } from '@radix-ui/react-icons';
import { Box, Callout, Flex, Text } from '@radix-ui/themes';
import { useState, type DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { MAX_REFERENCE_IMAGE_BYTES, type SceneStyleDto } from '@pod/contracts/client';
import { BusyButton } from '../../../shared/BusyButton.js';
import { ConnectionNotice } from '../../../shared/ConnectionNotice.js';
import { ErrorCallout } from '../../../shared/ErrorCallout.js';
import { errorValues } from '../../../shared/error-values.js';
import { formatBytes } from '../../../shared/format.js';
import { useChosenAi } from '../../../shared/use-ai.js';
import { missingConnection } from '../../../shared/missing-connection.js';
import { useDescribeSceneStyle } from './use-scenes.js';

const IMAGE_TYPES: ReadonlySet<string> = new Set(['image/png', 'image/jpeg']);

/** A described style: the scene and the look options the photo showed. */
export type DescribedStyle = Extract<SceneStyleDto, { found: true }>;

interface StyleFromPhotoProps {
  readonly designId: string;
  readonly disabled: boolean;
  /** Receives the photo's style. */
  readonly onDescribed: (style: DescribedStyle) => void;
}

/**
 * Lets the seller pick or drop a photo they like; the chosen text service
 * describes its setting and light, never its design, for the seller to edit.
 */
export function StyleFromPhoto({ designId, disabled, onDescribed }: StyleFromPhotoProps) {
  const { t, i18n } = useTranslation();
  const { service } = useChosenAi().text;
  const describe = useDescribeSceneStyle(designId);
  const [unusable, setUnusable] = useState(false);
  const [outcome, setOutcome] = useState<SceneStyleDto | null>(null);
  const busy = disabled || describe.isPending;
  const size = formatBytes(MAX_REFERENCE_IMAGE_BYTES, i18n.language);

  const run = (image?: string) => {
    setUnusable(false);
    setOutcome(null);
    describe.mutate(image, {
      onSuccess: (style) => {
        setOutcome(style);
        if (style?.found) onDescribed(style);
      },
    });
  };

  const drop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (busy || !file) return;
    // Checked here too, so a wrong file is named at once instead of crossing to the app.
    if (!IMAGE_TYPES.has(file.type) || file.size > MAX_REFERENCE_IMAGE_BYTES) {
      setOutcome(null);
      setUnusable(true);
      return;
    }
    run(base64Of(new Uint8Array(await file.arrayBuffer())));
  };

  const missing = missingConnection(describe.error);
  const problem = unusable
    ? t('errors.REFERENCE_IMAGE_UNREADABLE', errorValues(i18n.language))
    : outcome?.found === false
      ? t(`scenes.style.${outcome.reason}`, { service })
      : null;
  return (
    <Flex direction="column" gap="2">
      <Text as="p" size="2" weight="medium">
        {t('scenes.style.title')}
      </Text>
      <PhotoDropZone
        help={t('scenes.style.help', { size, service })}
        busy={busy}
        loading={describe.isPending}
        onDrop={(event) => void drop(event)}
        onChoose={() => {
          run();
        }}
      />
      <Text size="1" color="gray" role="status">
        {describe.isPending
          ? t('scenes.style.reading', { service })
          : outcome?.found
            ? t('scenes.style.done', { service })
            : ''}
      </Text>
      {problem && (
        <Callout.Root color="amber" size="1">
          <Callout.Text>{problem}</Callout.Text>
        </Callout.Root>
      )}
      {missing ? (
        <ConnectionNotice {...missing} />
      ) : (
        describe.error && <ErrorCallout error={describe.error} />
      )}
    </Flex>
  );
}

interface PhotoDropZoneProps {
  readonly help: string;
  readonly busy: boolean;
  readonly loading: boolean;
  readonly onDrop: (event: DragEvent<HTMLDivElement>) => void;
  readonly onChoose: () => void;
}

/** Where a photo is dropped, with a button to pick one instead. */
function PhotoDropZone({ help, busy, loading, onDrop, onChoose }: PhotoDropZoneProps) {
  const { t } = useTranslation();
  return (
    <Box
      p="3"
      style={{ border: '1px dashed var(--gray-a7)', borderRadius: 'var(--radius-3)' }}
      onDragOver={(event) => {
        event.preventDefault();
      }}
      onDrop={onDrop}
    >
      <Flex direction="column" gap="2" align="start">
        <Text size="1" color="gray">
          {help}
        </Text>
        <BusyButton
          size="1"
          variant="soft"
          type="button"
          busy={busy}
          loading={loading}
          onClick={onChoose}
        >
          <ImageIcon />
          {t('scenes.style.choose')}
        </BusyButton>
      </Flex>
    </Box>
  );
}

/** Base64 in slices, as one call with millions of arguments overflows the stack. */
function base64Of(bytes: Uint8Array): string {
  let binary = '';
  for (let at = 0; at < bytes.length; at += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  }
  return btoa(binary);
}
