import type {
  CheckListingTextRequest,
  ListingTextCheckDto,
  TranslateListingTextRequest,
  TranslationsDto,
  WriteListingTextRequest,
  WrittenListingTextDto,
} from '@pod/contracts';
import {
  findAiTells,
  findListingTrademarks,
  MARKETS,
  productFamilyId,
  type FinishedText,
  type TranslateListingText,
  type WriteListingText,
} from '@pod/core';

const writtenDto = ({ text, humanizer }: FinishedText): WrittenListingTextDto => ({
  ...text,
  humanizer,
});

/**
 * Listing text written and translated by the chosen language model and checked as the seller
 * edits it, for trademarks and for phrases that read as machine-written;
 * only the window offers it.
 */
export class TextService {
  constructor(
    private readonly writer: Pick<WriteListingText, 'execute'>,
    private readonly translator: Pick<TranslateListingText, 'execute'>,
  ) {}

  async writeListingText(request: WriteListingTextRequest): Promise<WrittenListingTextDto> {
    const keywords = request.keywords?.map(({ market, ...word }) =>
      market === undefined ? word : { ...word, language: MARKETS[market].language },
    );
    return writtenDto(await this.writer.execute({ ...request, keywords }));
  }

  checkListingText(request: CheckListingTextRequest): Promise<ListingTextCheckDto> {
    const { language, designName, ...text } = request;
    return Promise.resolve({
      trademarks: findListingTrademarks(text),
      aiTells: findAiTells(text, language, [designName ?? null]),
    });
  }

  async translateListingText(request: TranslateListingTextRequest): Promise<TranslationsDto> {
    const { languages, familyId, ...text } = request;
    const { translations, failed } = await this.translator.execute(
      text,
      languages,
      familyId === undefined ? undefined : productFamilyId(familyId),
    );
    return {
      translations: translations.map(({ language, ...finished }) => ({
        language,
        ...writtenDto(finished),
      })),
      failed,
    };
  }
}
