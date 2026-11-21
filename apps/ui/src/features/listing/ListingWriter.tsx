import { Flex, Text, TextArea, TextField } from '@radix-ui/themes';
import { typedCharacterCount } from '@pod/rules';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LISTING_WRITER_LIMITS, type WrittenListingTextDto } from '@pod/contracts/client';
import { BusyButton } from '../../shared/BusyButton.js';
import { ConfirmDialog } from '../../shared/ConfirmDialog.js';
import { ConnectionNotice } from '../../shared/ConnectionNotice.js';
import { ErrorCallout } from '../../shared/ErrorCallout.js';
import type { ChosenAi } from '../../shared/use-ai.js';
import { ResearchPicker } from '../research/ResearchPicker.js';
import { useWriteListingText } from './use-listing-text.js';
import { useWriterKeywords } from './use-writer-keywords.js';

interface ListingWriterProps {
  readonly designId: string;
  /** The shop's main language, which listings are written in. */
  readonly language: string;
  /** The variants the listing sells, so the text is about those. */
  readonly variantIds: readonly string[];
  /** The service chosen to write listing text. */
  readonly writer: ChosenAi;
  /** The seller wrote or edited words that writing would replace. */
  readonly replaces: boolean;
  readonly onWritten: (text: WrittenListingTextDto) => void;
}

/** Lets the chosen service draft the title, description and tags, from the seller's notes. */
export function ListingWriter(props: ListingWriterProps) {
  const { designId, language, variantIds, writer, replaces, onWritten } = props;
  const { t } = useTranslation();
  const notesId = useId();
  const [notes, setNotes] = useState('');
  const keywords = useWriterKeywords();
  const [pickError, setPickError] = useState<unknown>(null);
  const write = useWriteListingText(onWritten);

  const { service } = writer;
  if (!writer.connected) {
    return (
      <ConnectionNotice code="AI_NOT_CONNECTED" message={t('listing.writerOff', { service })} />
    );
  }

  return (
    <Flex
      direction="column"
      gap="2"
      p="3"
      style={{ background: 'var(--accent-a2)', borderRadius: 'var(--radius-3)' }}
    >
      <KeywordsField
        id={`${notesId}-keywords`}
        keywords={keywords}
        clearPickError={() => {
          setPickError(null);
        }}
        onPickError={setPickError}
      />
      <Flex direction="column" gap="1">
        <Text as="label" size="2" weight="medium" htmlFor={notesId}>
          {t('listing.writerNotes', { service })}
        </Text>
        <TextArea
          id={notesId}
          rows={2}
          value={notes}
          maxLength={LISTING_WRITER_LIMITS.notes}
          placeholder={t('listing.writerNotesExample')}
          aria-describedby={`${notesId}-hint`}
          onChange={(event) => {
            setNotes(event.target.value);
          }}
        />
        <Text id={`${notesId}-hint`} size="1" color="gray">
          {t('common.characterCount', {
            used: typedCharacterCount(notes),
            limit: LISTING_WRITER_LIMITS.notes,
          })}
        </Text>
      </Flex>
      <Flex gap="3" align="center" wrap="wrap">
        <WriteButton
          service={service}
          writing={write.isPending}
          blocked={keywords.tooMany}
          replaces={replaces}
          onWrite={() => {
            write.mutate({
              designId,
              language,
              variantIds: [...variantIds],
              keywords: keywords.requested(),
              ...(notes.trim() ? { notes: notes.trim() } : {}),
            });
          }}
        />
        <Text size="1" color="gray" role="status">
          {write.isPending ? t('listing.writerWriting', { service }) : t('listing.writerHint')}
        </Text>
      </Flex>
      {pickError !== null && <ErrorCallout error={pickError} />}
      {write.error && <ErrorCallout error={write.error} />}
    </Flex>
  );
}

interface WriteButtonProps {
  readonly service: string;
  readonly writing: boolean;
  readonly blocked: boolean;
  readonly replaces: boolean;
  readonly onWrite: () => void;
}

/** Writes the text; asks first when it would replace words the seller wrote. */
function WriteButton({ service, writing, blocked, replaces, onWrite }: WriteButtonProps) {
  const { t } = useTranslation();
  const button = (
    <BusyButton
      type="button"
      variant="soft"
      busy={writing}
      loading={writing}
      disabled={blocked}
      onClick={replaces ? undefined : onWrite}
    >
      {t('listing.writerWrite', { service })}
    </BusyButton>
  );
  if (!replaces) return button;
  return (
    <ConfirmDialog
      trigger={button}
      title={t('listing.writerReplaceTitle')}
      description={t('listing.writerReplaceBody')}
      confirmLabel={t('listing.writerReplaceConfirm', { service })}
      color="jade"
      onConfirm={onWrite}
    />
  );
}

interface KeywordsFieldProps {
  readonly id: string;
  readonly keywords: ReturnType<typeof useWriterKeywords>;
  readonly clearPickError: () => void;
  readonly onPickError: (error: unknown) => void;
}

/** The keywords to work into the text, typed or picked from saved research. */
function KeywordsField({ id, keywords, clearPickError, onPickError }: KeywordsFieldProps) {
  const { t } = useTranslation();
  return (
    <Flex direction="column" gap="1">
      <Flex justify="between" align="center" gap="2">
        <Text as="label" size="2" weight="medium" htmlFor={id}>
          {t('listing.writerKeywords')}
        </Text>
        <ResearchPicker
          onPick={(words) => {
            clearPickError();
            keywords.pick(words);
          }}
          onError={onPickError}
        />
      </Flex>
      <TextField.Root
        id={id}
        value={keywords.text}
        placeholder={t('listing.writerKeywordsExample')}
        aria-describedby={`${id}-hint`}
        aria-invalid={keywords.tooMany}
        onChange={(event) => {
          keywords.setText(event.target.value);
        }}
      />
      <Text id={`${id}-hint`} size="1" color={keywords.tooMany ? 'red' : 'gray'}>
        {t('listing.writerKeywordsHint', {
          used: keywords.count,
          limit: LISTING_WRITER_LIMITS.keywords,
        })}
      </Text>
    </Flex>
  );
}
