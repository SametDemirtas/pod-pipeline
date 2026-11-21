import { useState } from 'react';
import type { ShopOptionsDto, WrittenListingTextDto } from '@pod/contracts/client';
import type { ChosenAi } from '../../shared/use-ai.js';
import { formatTags } from '../../shared/tags.js';
import { hasOwnWords, mainLanguage, type DraftField, type ListingDraft } from './listing-draft.js';
import { ListingTextFields } from './ListingTextFields.js';
import { ListingWriter } from './ListingWriter.js';
import { TextChecks } from './TextChecks.js';
import { TranslationsPanel } from './TranslationsPanel.js';

interface ListingTextSectionProps {
  readonly designId: string;
  readonly familyId: string;
  /** `null` when the design has none. */
  readonly designName: string | null;
  readonly shop: ShopOptionsDto;
  readonly writer: ChosenAi;
  readonly draft: ListingDraft;
  readonly descriptionLimit: number;
  readonly invalid: ReadonlySet<DraftField>;
  readonly onChange: (change: Partial<ListingDraft>) => void;
}

/** The listing's words: written by the AI or typed, checked, and translated. */
export function ListingTextSection(props: ListingTextSectionProps) {
  const { draft, shop, onChange } = props;
  // The words the writer wrote last, with what the humanizer did with them.
  const [written, setWritten] = useState<WrittenListingTextDto | null>(null);
  const [startTitle] = useState(draft.title);
  const language = mainLanguage(shop);

  return (
    <>
      <ListingWriter
        designId={props.designId}
        language={language}
        variantIds={draft.variantIds}
        writer={props.writer}
        replaces={hasOwnWords(draft, startTitle, written)}
        onWritten={(text) => {
          setWritten(text);
          onChange({
            title: text.title,
            description: text.description,
            tags: formatTags(text.tags),
          });
        }}
      />
      <ListingTextFields
        draft={draft}
        shop={shop}
        descriptionLimit={props.descriptionLimit}
        invalid={props.invalid}
        onChange={onChange}
      />
      <TextChecks
        language={language}
        title={draft.title}
        description={draft.description}
        tags={draft.tags}
        designName={props.designName}
        written={written}
      />
      <TranslationsPanel
        draft={draft}
        familyId={props.familyId}
        languages={shop.languages.slice(1)}
        writer={props.writer}
        onChange={onChange}
      />
    </>
  );
}
