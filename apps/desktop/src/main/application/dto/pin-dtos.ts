import type { PinDto } from '@pod/contracts';
import type { Pin, PinLinks } from '@pod/core';
import { redact } from '../../shared/redact.js';
import { toAssetDto } from './asset-dto.js';

/** The pin as the window shows it, with a link to it once published. */
export function toPinDto(pin: Pin, links: PinLinks): PinDto {
  return {
    id: pin.id,
    designId: pin.designId,
    mockupId: pin.mockupId,
    title: pin.text.title,
    description: pin.text.description,
    altText: pin.text.altText,
    headline: pin.headline,
    boardId: pin.boardId,
    link: pin.link,
    image: toAssetDto(pin.image),
    aiModified: pin.aiModified,
    publishAt: pin.publishAt.toISOString(),
    state: pin.state,
    publishedUrl: pin.publishedId === null ? null : links.pinUrl(pin.publishedId),
    // Pins saved before failures were stored redacted may still name a token.
    failure: pin.failure === null ? null : redact(pin.failure),
    failureCode: pin.failureCode,
    createdAt: pin.createdAt.toISOString(),
  };
}
