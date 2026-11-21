import { TextArea, TextField } from '@radix-ui/themes';
import { useTranslation } from 'react-i18next';
import { LISTING_LIMITS, typedCharacterCount } from '@pod/rules';
import { Field } from '../../shared/Field.js';
import { parseTags } from '../../shared/tags.js';
import {
  formatPriceRange,
  parsePrice,
  priceExample,
  priceRange,
  type ShopCurrency,
} from '../../shared/price.js';
import { type DraftField, type ListingDraft } from './listing-draft.js';

type TextPart = Pick<ListingDraft, 'title' | 'description' | 'tags' | 'price'>;

interface ListingTextFieldsProps {
  readonly draft: TextPart;
  readonly shop: ShopCurrency;
  /** Etsy's, less the room a note about AI scenes needs while one is chosen. */
  readonly descriptionLimit: number;
  /** Fields the seller tried to submit while they were wrong. */
  readonly invalid: ReadonlySet<DraftField>;
  readonly onChange: (change: Partial<TextPart>) => void;
}

export function ListingTextFields(props: ListingTextFieldsProps) {
  const { draft, shop, descriptionLimit, invalid, onChange } = props;
  const { t } = useTranslation();
  const titleLength = typedCharacterCount(draft.title);
  const descriptionLength = typedCharacterCount(draft.description);
  const titleInvalid = titleLength > LISTING_LIMITS.title || invalid.has('title');
  const descriptionInvalid = descriptionLength > descriptionLimit || invalid.has('description');

  return (
    <>
      <Field
        id="listing-title"
        label={t('listing.title')}
        hint={t('common.characterCount', { used: titleLength, limit: LISTING_LIMITS.title })}
        invalid={titleInvalid}
      >
        {(describedBy) => (
          <TextField.Root
            id="listing-title"
            value={draft.title}
            aria-describedby={describedBy}
            aria-invalid={titleInvalid}
            aria-required
            onChange={(event) => {
              onChange({ title: event.target.value });
            }}
          />
        )}
      </Field>
      <Field
        id="listing-description"
        label={t('listing.description')}
        hint={t('common.characterCount', {
          used: descriptionLength,
          limit: descriptionLimit,
        })}
        invalid={descriptionInvalid}
      >
        {(describedBy) => (
          <TextArea
            id="listing-description"
            rows={6}
            aria-describedby={describedBy}
            aria-required
            aria-invalid={descriptionInvalid}
            value={draft.description}
            onChange={(event) => {
              onChange({ description: event.target.value });
            }}
          />
        )}
      </Field>
      <TagsField
        tags={draft.tags}
        invalid={invalid.has('tags')}
        onChange={(tags) => {
          onChange({ tags });
        }}
      />
      <PriceField
        price={draft.price}
        shop={shop}
        invalid={invalid.has('price')}
        onChange={(price) => {
          onChange({ price });
        }}
      />
    </>
  );
}

interface TagsFieldProps {
  readonly tags: string;
  readonly invalid: boolean;
  readonly onChange: (tags: string) => void;
}

function TagsField({ tags, invalid, onChange }: TagsFieldProps) {
  const { t } = useTranslation();
  const tagCount = parseTags(tags).length;
  const tagsInvalid = tagCount > LISTING_LIMITS.tags || invalid;
  return (
    <Field
      id="listing-tags"
      label={t('listing.tags')}
      hint={t('listing.tagsHint', {
        used: tagCount,
        limit: LISTING_LIMITS.tags,
        length: LISTING_LIMITS.tagLength,
      })}
      invalid={tagsInvalid}
    >
      {(describedBy) => (
        <TextField.Root
          id="listing-tags"
          value={tags}
          aria-describedby={describedBy}
          aria-invalid={tagsInvalid}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        />
      )}
    </Field>
  );
}

interface PriceFieldProps {
  readonly price: string;
  readonly shop: ShopCurrency;
  readonly invalid: boolean;
  readonly onChange: (price: string) => void;
}

function PriceField({ price, shop, invalid, onChange }: PriceFieldProps) {
  const { t, i18n } = useTranslation();
  const unreadable = price.trim() !== '' && parsePrice(price, shop.currencyDigits) === null;
  const example = priceExample(shop.currencyDigits, i18n.language);
  const priceInvalid = unreadable || invalid;
  return (
    <Field
      id="listing-price"
      label={t('listing.price', { currency: shop.currency })}
      hint={
        priceInvalid
          ? t('listing.priceInvalid', { example })
          : priceRange(shop)
            ? t('listing.priceHint', { example })
            : t('listing.priceHintConverted', { example, ...formatPriceRange(i18n.language) })
      }
      invalid={priceInvalid}
    >
      {(describedBy) => (
        <TextField.Root
          id="listing-price"
          inputMode="decimal"
          placeholder={example}
          style={{ maxWidth: 160 }}
          value={price}
          aria-describedby={describedBy}
          aria-invalid={priceInvalid}
          aria-required
          onChange={(event) => {
            onChange(event.target.value);
          }}
        />
      )}
    </Field>
  );
}
