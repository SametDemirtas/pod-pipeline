import { Button, Callout, Flex } from '@radix-ui/themes';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { WrittenListingTextDto } from '@pod/contracts/client';
import { useDebouncedValue } from '../../shared/use-debounced-value.js';
import { formatTags } from '../../shared/tags.js';
import { formatList } from '../../shared/format.js';
import { HumanizerStatus } from './HumanizerStatus.js';
import { useListingTextCheck, type ListingWords } from './use-listing-text.js';

/** Checked once typing pauses, so each keystroke does not cost a round trip. */
const CHECK_DELAY_MS = 400;

interface TextChecksProps extends ListingWords {
  /** The language the words are in. */
  readonly language: string;
  /** The design's name, whose words may stand as they are; `null` when it has none. */
  readonly designName: string | null;
  /** The words the writer wrote last, with what the humanizer did; `null` before. */
  readonly written: WrittenListingTextDto | null;
}

const sameWords = (written: WrittenListingTextDto, words: ListingWords) =>
  written.title === words.title &&
  written.description === words.description &&
  formatTags(written.tags) === words.tags;

/**
 * Names trademarks and phrases that read as machine-written while the seller
 * writes or edits the title, description and tags.
 */
export function TextChecks(props: TextChecksProps) {
  const { t, i18n } = useTranslation();
  const { title, description, tags } = props;
  // One value, so the words settle together and are checked as one.
  const typed = useMemo(() => ({ title, description, tags }), [title, description, tags]);
  const words = useDebouncedValue(typed, CHECK_DELAY_MS);
  const { language, designName } = props;
  const check = useListingTextCheck(language, designName, words);
  const checked = check.isError ? undefined : check.data;
  // The writer's words come with their own check, and what was fixed holds only for them.
  const model = props.written && sameWords(props.written, props) ? props.written : null;
  const left = model ? model.humanizer.left : checked?.aiTells;
  const trademarks = checked?.trademarks ?? [];

  return (
    <>
      {check.isError && (
        <Callout.Root color="gray" size="1" role="status">
          <Flex direction="column" gap="2" align="start">
            <Callout.Text>{t('listing.textCheckUnavailable')}</Callout.Text>
            <Button type="button" size="1" variant="soft" onClick={() => void check.refetch()}>
              {t('errors.retry')}
            </Button>
          </Flex>
        </Callout.Root>
      )}
      {trademarks.length > 0 && (
        <Callout.Root color="amber" size="1" role="status">
          <Callout.Text>
            {t('listing.trademarks', { names: formatList(trademarks, i18n.language) })}
          </Callout.Text>
        </Callout.Root>
      )}
      {left && (title.trim() || description.trim()) && (
        <HumanizerStatus fixed={model?.humanizer.fixed ?? 0} left={left} />
      )}
    </>
  );
}
