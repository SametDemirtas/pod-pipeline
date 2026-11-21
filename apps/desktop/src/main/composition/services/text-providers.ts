import { AiCopywriter } from '@pod/adapter-ai';
import { TranslateListingText, WriteListingText } from '@pod/core';
import { LISTING_RULES } from '@pod/rules';
import type { SettingsStore } from '../../application/settings/settings-store.js';
import { SettingsPorts } from '../../application/settings/settings-ports.js';
import { TextService } from '../../application/listing/text-service.js';
import { languageModels } from '../ai/language-models.js';
import { translatePort } from '../provider-errors.js';
import type { SharedParts } from '../shared-parts.js';

/** Listing text written and translated by the seller's chosen language model. */
export function createTextService(
  parts: Pick<SharedParts, 'secrets' | 'fetch' | 'catalog' | 'print' | 'previews'>,
  settings: SettingsStore,
): TextService {
  const models = languageModels(parts, settings, 'textModel');
  const copywriter = translatePort(new AiCopywriter(models, LISTING_RULES), models.service);
  return new TextService(
    new WriteListingText({
      query: parts.catalog.query,
      printCatalog: parts.print.printCatalog,
      previews: parts.previews,
      facts: new SettingsPorts(settings),
      writer: copywriter,
      rules: LISTING_RULES,
    }),
    new TranslateListingText(copywriter, LISTING_RULES),
  );
}
