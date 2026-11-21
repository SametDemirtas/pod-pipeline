import { Callout, Flex, Text } from '@radix-ui/themes';
import { useTranslation } from 'react-i18next';
import { toggledIn } from '../../shared/collections.js';
import { ConnectionNotice } from '../../shared/ConnectionNotice.js';
import { ErrorCallout } from '../../shared/ErrorCallout.js';
import type { ChosenAi } from '../../shared/use-ai.js';
import { formatTags, parseTags } from '../../shared/tags.js';
import { formatList } from '../../shared/format.js';
import { BusyButton } from '../../shared/BusyButton.js';
import { CheckList } from './CheckList.js';
import { HumanizerStatus } from './HumanizerStatus.js';
import { textKeyOf, type DraftTranslation, type ListingDraft } from './listing-draft.js';
import {
  useListingTextCheck,
  useTranslateListingText,
  type TranslationSource,
} from './use-listing-text.js';

/** Language names in the interface's language, e.g. "German" for `de`. */
function languageNames(locale: string): (code: string) => string {
  const names = new Intl.DisplayNames([locale], { type: 'language' });
  return (code) => names.of(code) ?? code;
}

type TranslationPart = Pick<
  ListingDraft,
  'title' | 'description' | 'tags' | 'languages' | 'translations' | 'translatedFrom'
>;

interface TranslationsPanelProps {
  readonly draft: TranslationPart;
  /** The product the listing sells, so translations naming another brand are revised. */
  readonly familyId: string;
  /** The shop's other languages; listings are written in its main one. */
  readonly languages: readonly string[];
  /** The service chosen to write and translate listing text. */
  readonly writer: ChosenAi;
  readonly onChange: (change: Partial<TranslationPart>) => void;
}

/** Translations into the shop's other languages, sent with the draft. */
export function TranslationsPanel({
  draft,
  familyId,
  languages,
  writer,
  onChange,
}: TranslationsPanelProps) {
  const { t, i18n } = useTranslation();
  const translate = useTranslateListingText((translations, key) => {
    onChange({ translations, translatedFrom: key });
  });
  const names = languageNames(i18n.language);
  if (languages.length === 0) return null;
  if (!writer.connected) {
    return (
      <ConnectionNotice
        code="AI_NOT_CONNECTED"
        message={t('listing.translationsOff', {
          languages: formatList(languages.map(names), i18n.language),
          service: writer.service,
        })}
      />
    );
  }
  const outdated = draft.translations.length > 0 && draft.translatedFrom !== textKeyOf(draft);
  // Languages that failed, or were ticked after translating, would go out untranslated.
  const missing = draft.languages.filter(
    (language) => !draft.translations.some((translation) => translation.language === language),
  );

  return (
    <Flex direction="column" gap="2">
      <CheckList
        label={t('listing.translations')}
        options={languages.map((language) => ({ value: language, label: names(language) }))}
        checked={new Set(draft.languages)}
        onToggle={(language, on) => {
          onChange({ languages: toggledIn(draft.languages, language, on) });
        }}
      />
      <TranslateRow
        draft={draft}
        familyId={familyId}
        service={writer.service}
        pending={translate.isPending}
        onTranslate={translate.mutate}
      />
      {outdated && (
        <Callout.Root color="amber" size="1" role="status">
          <Callout.Text>{t('listing.translationsOutdated')}</Callout.Text>
        </Callout.Root>
      )}
      {!outdated && draft.translations.length > 0 && missing.length > 0 && (
        <Callout.Root color="amber" size="1" role="status">
          <Callout.Text>
            {t('listing.translationsMissing', {
              languages: formatList(missing.map(names), i18n.language),
            })}
          </Callout.Text>
        </Callout.Root>
      )}
      {!outdated && draft.translations.length > 0 && (
        <TranslationList draft={draft} names={names} />
      )}
      {translate.error && <ErrorCallout error={translate.error} />}
    </Flex>
  );
}

interface TranslateRowProps {
  readonly draft: TranslationPart;
  readonly familyId: string;
  readonly service: string;
  readonly pending: boolean;
  readonly onTranslate: (source: TranslationSource) => void;
}

function TranslateRow({ draft, familyId, service, pending, onTranslate }: TranslateRowProps) {
  const { t } = useTranslation();
  return (
    <Flex gap="3" align="center">
      <BusyButton
        type="button"
        variant="soft"
        disabled={draft.languages.length === 0 || !draft.title.trim() || !draft.description.trim()}
        busy={pending}
        loading={pending}
        onClick={() => {
          onTranslate({
            key: textKeyOf(draft),
            request: {
              title: draft.title,
              description: draft.description,
              tags: parseTags(draft.tags),
              languages: [...draft.languages],
              familyId,
            },
          });
        }}
      >
        {t('listing.translate', { service })}
      </BusyButton>
      <Text size="1" color="gray">
        {t('listing.translationsHint')}
      </Text>
    </Flex>
  );
}

interface TranslationListProps {
  readonly draft: Pick<ListingDraft, 'languages' | 'translations'>;
  readonly names: (code: string) => string;
}

function TranslationList({ draft, names }: TranslationListProps) {
  return (
    <Flex direction="column" gap="1">
      {draft.translations
        .filter((translation) => draft.languages.includes(translation.language))
        .map((translation) => (
          <Text as="div" size="2" key={translation.language}>
            <details>
              <summary>
                <strong>{names(translation.language)}</strong> {translation.title}
              </summary>
              <Text as="p" size="2" color="gray" style={{ whiteSpace: 'pre-line' }}>
                {translation.description}
              </Text>
              <Text as="p" size="1" color="gray">
                {formatTags(translation.tags)}
              </Text>
              <TranslationCheck translation={translation} />
            </details>
          </Text>
        ))}
    </Flex>
  );
}

/**
 * What the writer's check found in a translation. One a batch job wrote came
 * without a check, so its words are checked here; when that fails, the seller
 * is told they were not checked rather than that they read fine.
 */
function TranslationCheck({ translation }: { readonly translation: DraftTranslation }) {
  const { humanizer } = translation;
  if (humanizer) return <HumanizerStatus fixed={humanizer.fixed} left={humanizer.left} />;
  return <UncheckedTranslation translation={translation} />;
}

function UncheckedTranslation({ translation }: { readonly translation: DraftTranslation }) {
  const { t } = useTranslation();
  const words = {
    title: translation.title,
    description: translation.description,
    tags: formatTags(translation.tags),
  };
  // The design's name is known only in the main language's words, as when translating.
  const check = useListingTextCheck(translation.language, null, words);
  if (check.data && !check.isError) return <HumanizerStatus fixed={0} left={check.data.aiTells} />;
  if (check.isPending) return null;
  return (
    <Text as="p" size="1" color="gray" role="status">
      {t('listing.humanizerNotRun')}
    </Text>
  );
}
