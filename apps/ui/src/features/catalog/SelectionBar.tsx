import { Button, Flex, Text } from '@radix-ui/themes';
import { useTranslation } from 'react-i18next';
import { PrepareDialog } from '../batch/PrepareDialog.js';
import type { DesignSelection } from './use-design-selection.js';

interface SelectionBarProps {
  readonly selection: DesignSelection;
  /** Ids of the designs loaded on the page. */
  readonly shown: readonly string[];
  /** Designs the filter matches. */
  readonly total: number;
  /** The list still shows the previous filter's designs, so picking waits. */
  readonly updating: boolean;
  readonly onStarted: () => void;
}

/** Picks designs for preparing listings and opens the dialog that starts it. */
export function SelectionBar({ selection, shown, total, updating, onStarted }: SelectionBarProps) {
  const { t } = useTranslation();
  const count = selection.count(total);

  return (
    <Flex
      role="toolbar"
      aria-label={t('batch.toolbar')}
      align="center"
      gap="3"
      wrap="wrap"
      p="2"
      style={{ background: 'var(--gray-a2)', borderRadius: 'var(--radius-3)' }}
    >
      <Text size="2" weight="medium" role="status" style={{ minWidth: 160 }}>
        {t('batch.selected', { count })}
      </Text>
      <Button
        variant="ghost"
        size="1"
        disabled={updating}
        onClick={() => {
          selection.pickShown(shown);
        }}
      >
        {t('batch.selectPage')}
      </Button>
      <Button variant="ghost" size="1" disabled={updating} onClick={selection.pickAllMatching}>
        {t('batch.selectAll', { count: total })}
      </Button>
      {count > 0 && (
        <Button variant="ghost" size="1" color="gray" onClick={selection.clear}>
          {t('batch.clear')}
        </Button>
      )}
      <Flex flexGrow="1" justify="end">
        <PrepareDialog
          selection={updating ? null : selection.selection(total)}
          onStarted={onStarted}
        />
      </Flex>
    </Flex>
  );
}
