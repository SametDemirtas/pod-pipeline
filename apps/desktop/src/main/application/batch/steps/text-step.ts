import type { DesignDetailDto } from '@pod/contracts';
import { missingText, type BatchKeyword, type PreparedText } from '@pod/core';
import { TranslationIncompleteError } from '../../errors/batch-errors.js';
import { listedPrint } from '../../listing/listed-print.js';
import { whenFree } from '../busy-waits.js';
import {
  SKIPPED,
  type BatchCatalog,
  type BatchStepsDeps,
  type StepOutcome,
  type StepRunner,
} from '../step-runner.js';

type TextStepDeps = Pick<BatchStepsDeps, 'settings' | 'text' | 'wait'> & {
  readonly catalog: Pick<BatchCatalog, 'getDesign' | 'getListing' | 'checkPrint'>;
};

/**
 * Has the text AI write the listing in the shop's main language and translate
 * it into the others, as the window does. Text written before is kept, so
 * only what is missing is paid for again.
 */
export function textStep(deps: TextStepDeps): StepRunner {
  return async (item, run, signal) => {
    if (await deps.catalog.getListing({ id: item.designId })) return SKIPPED;
    const { languages } = await run.shop();
    const { language, kept, translations } = missingText(item.text, languages);
    if (kept && translations.length === 0) return SKIPPED;
    const design = await deps.catalog.getDesign({ id: item.designId });
    const prepared: PreparedText = kept ?? {
      language,
      text: await written(deps, design, language, item.keywords ?? [], signal),
      translations: [],
    };
    if (translations.length === 0) return { state: 'done', prepared: { text: prepared } };
    return translated(deps, prepared, translations, design.familyId, signal);
  };
}

/** The listing text in the main language, written for the variants the listing sells. */
async function written(
  { catalog, settings, text, wait }: TextStepDeps,
  design: DesignDetailDto,
  language: string,
  keywords: readonly BatchKeyword[],
  signal: AbortSignal,
): Promise<PreparedText['text']> {
  const { variantIds } = await listedPrint(catalog, settings, design);
  const request = {
    designId: design.id,
    language,
    variantIds: [...variantIds],
    keywords: [...keywords],
  };
  const { title, description, tags } = await whenFree(
    () => text.writeListingText(request),
    wait,
    signal,
  );
  return { title, description, tags };
}

/** Keeps every translation that came back, and fails the step for those that did not. */
async function translated(
  { text, wait }: Pick<TextStepDeps, 'text' | 'wait'>,
  prepared: PreparedText,
  languages: readonly string[],
  familyId: string,
  signal: AbortSignal,
): Promise<StepOutcome> {
  try {
    const request = {
      ...prepared.text,
      tags: [...prepared.text.tags],
      languages: [...languages],
      familyId,
    };
    const result = await whenFree(() => text.translateListingText(request), wait, signal);
    const added = result.translations.map(({ language, title, description, tags }) => ({
      language,
      text: { title, description, tags },
    }));
    const done = { ...prepared, translations: [...prepared.translations, ...added] };
    return result.failed.length === 0
      ? { state: 'done', prepared: { text: done } }
      : {
          state: 'failed',
          error: new TranslationIncompleteError(result.failed),
          prepared: { text: done },
        };
  } catch (error) {
    return { state: 'failed', error, prepared: { text: prepared } };
  }
}
