import { Select } from '@radix-ui/themes';
import { useTranslation } from 'react-i18next';
import type { SearchWordRequest } from '@pod/contracts/client';
import { marketLabel } from '../../shared/market-label.js';
import { useKeywordLists, useResearchList } from './use-research.js';
import { useReadSearchWords } from './use-search-words.js';

interface ResearchPickerProps {
  readonly onPick: (words: SearchWordRequest[]) => void;
  readonly onError: (error: unknown) => void;
}

const RUN = 'run:';
const LIST = 'list:';

/** Adds the search words of an earlier Etsy search or an imported keyword list. */
export function ResearchPicker({ onPick, onError }: ResearchPickerProps) {
  const { t } = useTranslation();
  const research = useResearchList();
  const keywordLists = useKeywordLists();
  const runs = research.data ?? [];
  const lists = keywordLists.data ?? [];
  const failed = research.isError || keywordLists.isError;
  const empty = runs.length === 0 && lists.length === 0;
  const read = useReadSearchWords();
  const reading = read.isPending;

  const pick = (value: string) => {
    const id = value.slice(value.indexOf(':') + 1);
    read.mutate(
      { kind: value.startsWith(RUN) ? 'run' : 'list', id },
      { onSuccess: onPick, onError },
    );
  };
  const placeholder = failed
    ? 'research.fromResearchFailed'
    : empty
      ? 'research.fromResearchNone'
      : 'research.fromResearch';

  return (
    <Select.Root value="" disabled={empty || reading} onValueChange={pick}>
      <Select.Trigger
        variant="ghost"
        aria-label={t('research.fromResearch')}
        aria-busy={reading}
        placeholder={t(placeholder)}
      />
      <Select.Content position="popper">
        {runs.length > 0 && (
          <Select.Group>
            <Select.Label>{t('research.history')}</Select.Label>
            {runs.map((run) => (
              <Select.Item key={run.id} value={`${RUN}${run.id}`}>
                {t('research.choiceLabel', {
                  name: run.query,
                  market: marketLabel(t, run.market),
                })}
              </Select.Item>
            ))}
          </Select.Group>
        )}
        {lists.length > 0 && (
          <Select.Group>
            <Select.Label>{t('research.lists')}</Select.Label>
            {lists.map((list) => (
              <Select.Item key={list.id} value={`${LIST}${list.id}`}>
                {t('research.choiceLabel', {
                  name: list.fileName,
                  market: marketLabel(t, list.market),
                })}
              </Select.Item>
            ))}
          </Select.Group>
        )}
      </Select.Content>
    </Select.Root>
  );
}
