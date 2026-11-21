import { Flex, Text } from '@radix-ui/themes';
import { useTranslation } from 'react-i18next';
import { BusyButton } from './BusyButton.js';

interface LoadMoreFooterProps {
  readonly shown: number;
  readonly total: number;
  /** Whether there is more to show. */
  readonly more: boolean;
  readonly loading?: boolean;
  readonly onLoadMore: () => void;
}

/** How much of a long list is shown, and a button for the next part. */
export function LoadMoreFooter(props: LoadMoreFooterProps) {
  const { shown, total, more, loading = false, onLoadMore } = props;
  const { t } = useTranslation();

  return (
    <Flex justify="between" align="center" gap="3">
      <Text size="2" color="gray" aria-live="polite">
        {t('common.showing', { shown, total })}
      </Text>
      {more && (
        <BusyButton variant="soft" busy={loading} loading={loading} onClick={onLoadMore}>
          {t('common.loadMore')}
        </BusyButton>
      )}
    </Flex>
  );
}
