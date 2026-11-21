import { LISTING_WRITER_LIMITS, type ResearchMarket, type SearchWordRequest } from '@pod/contracts';
import {
  listWordsFor,
  listsForMarket,
  recentRun,
  searchWordsOfRun,
  type DesignWords,
} from '@pod/rules';
import { productFamilyId, productTypeOf, researchPhrase } from '@pod/core';
import {
  SKIPPED,
  type BatchCatalog,
  type BatchStepsDeps,
  type StepRunner,
} from '../step-runner.js';

type ResearchStepDeps = Pick<BatchStepsDeps, 'clock' | 'keywordLists'> & {
  readonly catalog: Pick<BatchCatalog, 'getDesign' | 'listResearch' | 'getResearch'>;
};

/**
 * Gathers the listing writer's keywords from what the seller saved: a recent
 * Research page run for the design's words, then the imported keyword lists
 * (eRank, Marmalead) of the market that fit the design. It never searches
 * Etsy; with no saved words the text is written without keywords.
 */
export function researchStep(deps: ResearchStepDeps): StepRunner {
  return async (item, { job }) => {
    if (item.keywords !== null) return SKIPPED;
    const design = await deps.catalog.getDesign({ id: item.designId });
    const familyId = productFamilyId(design.familyId);
    const query = researchPhrase(design.concept.name, familyId);
    const [researched, listed] = await Promise.all([
      savedResearchWords(deps, query, job.market),
      importedWords(
        deps,
        { product: productTypeOf(familyId), conceptName: design.concept.name },
        job.market,
      ),
    ]);
    const keywords = uniqueTerms([...researched, ...listed]).slice(
      0,
      LISTING_WRITER_LIMITS.keywords,
    );
    return { state: keywords.length > 0 ? 'done' : 'skipped', prepared: { keywords } };
  };
}

async function savedResearchWords(
  { catalog, clock }: Pick<ResearchStepDeps, 'catalog' | 'clock'>,
  query: string,
  market: ResearchMarket,
): Promise<SearchWordRequest[]> {
  const recent = recentRun(await catalog.listResearch(), query, market, clock.now());
  return recent ? searchWordsOfRun(await catalog.getResearch({ id: recent.id })) : [];
}

async function importedWords(
  { keywordLists }: Pick<ResearchStepDeps, 'keywordLists'>,
  design: DesignWords,
  market: ResearchMarket,
): Promise<SearchWordRequest[]> {
  const chosen = listsForMarket(await keywordLists.listKeywordLists(), market);
  const lists = await Promise.all(chosen.map(({ id }) => keywordLists.getKeywordList({ id })));
  return listWordsFor(lists, design, LISTING_WRITER_LIMITS.keywords);
}

/** Each term once, where it first comes. */
function uniqueTerms(words: readonly SearchWordRequest[]): SearchWordRequest[] {
  const seen = new Set<string>();
  return words.filter(({ term }) => {
    const key = term.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
