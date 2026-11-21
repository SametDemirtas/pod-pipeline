import { Button, Dialog, Flex } from '@radix-ui/themes';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { assetUrl } from '@pod/contracts/client';
import { BusyButton } from '../../shared/BusyButton.js';
import { ErrorCallout } from '../../shared/ErrorCallout.js';
import { useSavePhoto } from './use-mockups.js';

interface PhotoViewerProps {
  readonly designId: string;
  readonly mockupId: string;
  readonly storageKey: string;
  /** Names the photo for screen readers, e.g. its caption. */
  readonly photo: string;
  readonly alt: string;
  /** The thumbnail, which opens the photo at full size when clicked. */
  readonly children: ReactNode;
}

/** A photo at full size, to look at the print closely and save a copy. */
export function PhotoViewer(props: PhotoViewerProps) {
  const { t } = useTranslation();

  return (
    <Dialog.Root>
      <Dialog.Trigger>
        <button
          type="button"
          aria-label={t('mockups.enlarge', { photo: props.photo })}
          style={{
            all: 'unset',
            display: 'block',
            width: '100%',
            cursor: 'zoom-in',
            borderRadius: 'var(--radius-3)',
          }}
        >
          {props.children}
        </button>
      </Dialog.Trigger>
      <Dialog.Content maxWidth="min(1400px, 94vw)" aria-describedby={undefined}>
        <Dialog.Title size="2">{props.photo}</Dialog.Title>
        <img
          src={assetUrl(props.storageKey)}
          alt={props.alt}
          style={{
            display: 'block',
            width: '100%',
            maxHeight: '78vh',
            objectFit: 'contain',
            background: 'var(--gray-a2)',
            borderRadius: 'var(--radius-3)',
          }}
        />
        <Flex gap="3" justify="end" mt="3">
          <SavePhotoButton designId={props.designId} mockupId={props.mockupId} />
          <Dialog.Close>
            <Button variant="soft" color="gray">
              {t('mockups.close')}
            </Button>
          </Dialog.Close>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}

function SavePhotoButton({ designId, mockupId }: { designId: string; mockupId: string }) {
  const { t } = useTranslation();
  const save = useSavePhoto(designId);

  return (
    <Flex direction="column" gap="2" align="end">
      <BusyButton
        busy={save.isPending}
        loading={save.isPending}
        onClick={() => {
          save.mutate(mockupId);
        }}
      >
        {save.data === true ? t('mockups.saved') : t('mockups.save')}
      </BusyButton>
      {save.error && <ErrorCallout error={save.error} />}
    </Flex>
  );
}
