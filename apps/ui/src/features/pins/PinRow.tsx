import { Badge, Box, Flex, Text } from '@radix-ui/themes';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { isApiErrorCode, type PinDto, type PinState } from '@pod/contracts/client';
import { DesignImage } from '../../shared/DesignImage.js';
import { errorValues } from '../../shared/error-values.js';
import { PinActions } from './PinActions.js';
import { useOverdue } from './use-overdue.js';

const STATE_COLORS: Readonly<Record<PinState, 'amber' | 'blue' | 'gray' | 'jade' | 'red'>> = {
  proposed: 'amber',
  planned: 'blue',
  publishing: 'gray',
  published: 'jade',
  failed: 'red',
};

/** A stored failure keeps only its code; pins only ever fail at Pinterest. */
const PIN_FAILURE_DETAILS = { service: 'Pinterest' };

interface PinRowProps {
  readonly pin: PinDto;
  readonly boardName: string;
  /** Places the focus once the pin, and its row with it, is gone. */
  readonly onRemoved: () => void;
}

/** One pin with what can be done with it now. */
export function PinRow({ pin, boardName, onRemoved }: PinRowProps) {
  const { t, i18n } = useTranslation();
  const row = useRef<HTMLLIElement>(null);
  const waiting = pin.state === 'planned' || pin.state === 'proposed';
  const overdue = useOverdue(pin.publishAt, waiting);
  const when = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(pin.publishAt));

  return (
    <Flex asChild gap="3" align="start">
      <li ref={row} tabIndex={-1}>
        <Box width="72px" flexShrink="0">
          <DesignImage
            storageKey={pin.image.storageKey}
            width={160}
            imageWidth={pin.image.width}
            imageHeight={pin.image.height}
            alt={t('pins.imageAlt', { title: pin.title })}
          />
        </Box>
        <Flex direction="column" gap="1" flexGrow="1" minWidth="0">
          <Flex gap="2" align="center" wrap="wrap">
            <Text weight="medium">{pin.title}</Text>
            <Badge color={STATE_COLORS[pin.state]}>{t(`pins.states.${pin.state}`)}</Badge>
            {pin.aiModified && <Badge variant="outline">{t('pins.aiModified')}</Badge>}
          </Flex>
          <Text size="2" color="gray">
            {t('pins.where', { board: boardName, when })}
          </Text>
          {pin.state === 'failed' && <PinFailure pin={pin} />}
          {overdue && (
            <Text size="2" color="amber">
              {t(pin.state === 'planned' ? 'pins.overdue' : 'pins.overdueProposed')}
            </Text>
          )}
          <PinActions pin={pin} row={row} onRemoved={onRemoved} />
        </Flex>
      </li>
    </Flex>
  );
}

/** Why publishing failed, in the seller's language, with the service's own words below. */
function PinFailure({ pin }: { pin: PinDto }) {
  const { t, i18n } = useTranslation();
  const code = pin.failureCode !== null && isApiErrorCode(pin.failureCode) ? pin.failureCode : null;
  return (
    <Flex direction="column">
      <Text size="2" color="red">
        {code ? t(`errors.${code}`, errorValues(i18n.language, PIN_FAILURE_DETAILS)) : pin.failure}
      </Text>
      {code && pin.failure && (
        <Text size="1" color="gray">
          {pin.failure}
        </Text>
      )}
    </Flex>
  );
}
