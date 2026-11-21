import { Flex, Heading, Skeleton, Text } from '@radix-ui/themes';
import { useRef, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type DesignDetailDto,
  type MockupDto,
  type PinDto,
  type BoardDto,
} from '@pod/contracts/client';
import { isPublishablePhoto } from '@pod/rules';
import { BusyButton } from '../../shared/BusyButton.js';
import { ConnectionNotice } from '../../shared/ConnectionNotice.js';
import { ErrorCallout } from '../../shared/ErrorCallout.js';
import { familyLabel } from '../../shared/family-label.js';
import { LoadingStatus } from '../../shared/LoadingStatus.js';
import { useConnections } from '../../shared/use-connections.js';
import { useMockups } from '../mockups/use-mockups.js';
import { NewPinDialog } from './NewPinDialog.js';
import { PinRow } from './PinRow.js';
import { useBoards, usePins } from './use-pins.js';

/** The design's Pinterest pins: planned in the app and published at their time. */
export function PinsSection({ design }: { design: DesignDetailDto }) {
  const { t } = useTranslation();
  const connections = useConnections();
  const connected = Boolean(connections.data?.pinterest);
  const pins = usePins(design.id);
  const boards = useBoards(connected);
  const mockups = useMockups(design.id);
  // Scenes whose print the seller has not confirmed stay out of pins, as out of listings.
  const photos = mockups.data?.filter(isPublishablePhoto);
  const boardName = (id: string) => boards.data?.find((board) => board.id === id)?.name ?? id;
  const list = useRef<HTMLUListElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  // After the list renders without the pin; the heading when no pin is left.
  const focusAfterRemoval = () => {
    requestAnimationFrame(() => (list.current ?? heading.current)?.focus());
  };

  return (
    <Flex direction="column" gap="3">
      <Flex justify="between" align="center" gap="3" wrap="wrap">
        <Heading as="h2" size="4" ref={heading} tabIndex={-1}>
          {t('pins.heading')}
        </Heading>
        <NewPinAction
          design={design}
          connected={connected}
          boards={boards.data}
          photos={photos}
          loading={boards.isPending || mockups.isPending}
        />
      </Flex>
      <Text size="2" color="gray">
        {t('pins.help')}
      </Text>
      {connections.data && !connected && <ConnectionNotice code="PINTEREST_NOT_CONNECTED" />}
      {connections.isError && (
        <ErrorCallout error={connections.error} onRetry={() => void connections.refetch()} />
      )}
      {connected && photos?.length === 0 && (
        <Text size="2" color="gray">
          {t('pins.needsPhotos')}
        </Text>
      )}
      {boards.data?.length === 0 && (
        <Text size="2" color="gray">
          {t('pins.noBoards')}
        </Text>
      )}
      {boards.isError && (
        <ErrorCallout error={boards.error} onRetry={() => void boards.refetch()} />
      )}
      {connected && mockups.isError && (
        <ErrorCallout error={mockups.error} onRetry={() => void mockups.refetch()} />
      )}
      {pins.isPending && (
        <LoadingStatus>
          <Skeleton height="72px" />
        </LoadingStatus>
      )}
      {pins.isError && <ErrorCallout error={pins.error} onRetry={() => void pins.refetch()} />}
      {pins.data && pins.data.length > 0 && (
        <PinList ref={list} pins={pins.data} boardName={boardName} onRemoved={focusAfterRemoval} />
      )}
      {pins.data?.length === 0 && connected && (
        <Text size="2" color="gray">
          {t('pins.none')}
        </Text>
      )}
    </Flex>
  );
}

interface NewPinActionProps {
  readonly design: DesignDetailDto;
  readonly connected: boolean;
  readonly boards: readonly BoardDto[] | undefined;
  readonly photos: readonly MockupDto[] | undefined;
  /** While the boards or photos load, the button shows as busy. */
  readonly loading: boolean;
}

function NewPinAction({ design, connected, boards, photos, loading }: NewPinActionProps) {
  const { t } = useTranslation();
  if (connected && boards?.length && photos?.length) {
    return (
      <NewPinDialog
        designId={design.id}
        defaultTitle={design.concept.name ?? familyLabel(t, design.familyId)}
        mockups={photos}
        boards={boards}
      />
    );
  }
  return (
    connected &&
    loading && (
      <BusyButton busy loading disabled>
        {t('pins.new')}
      </BusyButton>
    )
  );
}

interface PinListProps {
  readonly ref: Ref<HTMLUListElement>;
  readonly pins: readonly PinDto[];
  readonly boardName: (id: string) => string;
  readonly onRemoved: () => void;
}

function PinList({ ref, pins, boardName, onRemoved }: PinListProps) {
  const { t } = useTranslation();
  return (
    <Flex asChild direction="column" gap="3">
      <ul
        ref={ref}
        tabIndex={-1}
        aria-label={t('pins.list')}
        style={{ listStyle: 'none', margin: 0, padding: 0 }}
      >
        {pins.map((pin) => (
          <PinRow key={pin.id} pin={pin} boardName={boardName(pin.boardId)} onRemoved={onRemoved} />
        ))}
      </ul>
    </Flex>
  );
}
