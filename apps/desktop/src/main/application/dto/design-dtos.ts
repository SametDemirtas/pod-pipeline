import {
  UPSCALE_MODELS,
  type DesignDetailDto,
  type DesignDto,
  type ImportPreviewDto,
  type ImportResultDto,
  type PageDto,
  type UpscaleModelDto,
} from '@pod/contracts';
import {
  keptOrientationOf,
  type Design,
  type DesignDetails,
  type DesignView,
  type ImportPreview,
  type ImportResult,
  type Page,
} from '@pod/core';
import { toAssetDto } from './asset-dto.js';

/** The model that made the artwork larger; one the app no longer knows reads as a photo's. */
function upscaleModelOf({ upscale }: Design): UpscaleModelDto | null {
  if (!upscale) return null;
  return UPSCALE_MODELS.find((model) => model === upscale.model) ?? 'photo';
}

function toDesignDto(design: DesignView): DesignDto {
  return {
    id: design.id,
    designKey: design.designKey,
    familyId: design.familyId,
    revision: design.revision,
    concept: { id: design.concept.id, key: design.concept.key, name: design.concept.name },
    asset: toAssetDto(design.asset),
    sourcePath: design.sourcePath,
    upscaleModel: upscaleModelOf(design),
    rotation: design.rotation?.degrees ?? null,
    rotationReason: design.rotation?.reason ?? null,
    keptOrientationReason: keptOrientationOf(design)?.reason ?? null,
    createdAt: design.createdAt.toISOString(),
    updatedAt: design.updatedAt.toISOString(),
  };
}

export function toDesignPageDto(page: Page<DesignView>): PageDto<DesignDto> {
  return { items: page.items.map(toDesignDto), nextCursor: page.nextCursor, total: page.total };
}

export function toDesignDetailDto({ design, revisions }: DesignDetails): DesignDetailDto {
  return {
    ...toDesignDto(design),
    revisions: revisions.map((revision: Design) => ({
      revision: revision.revision,
      asset: toAssetDto(revision.asset),
      sourcePath: revision.sourcePath,
      upscaleModel: upscaleModelOf(revision),
      rotation: revision.rotation?.degrees ?? null,
      recordedAt: revision.updatedAt.toISOString(),
    })),
  };
}

export function toImportPreviewDto(preview: ImportPreview): ImportPreviewDto {
  return {
    rootPath: preview.rootPath,
    fingerprint: preview.fingerprint,
    items: preview.items.map((item) => ({
      designKey: item.designKey,
      conceptKey: item.conceptKey,
      conceptName: item.conceptName,
      familyId: item.familyId,
      relativePath: item.relativePath,
      width: item.width,
      height: item.height,
      byteSize: item.byteSize,
      status: item.status,
      currentRevision: item.currentRevision,
      borrowed: item.borrowed,
    })),
    skipped: preview.skipped.map(({ relativePath, reason }) => ({ relativePath, reason })),
    conceptRenames: preview.conceptRenames.map(({ conceptKey, from, to }) => ({
      conceptKey,
      from,
      to,
    })),
    counts: { ...preview.counts },
  };
}

export function toImportResultDto(result: ImportResult): ImportResultDto {
  return {
    created: [...result.created],
    updated: [...result.updated],
    unchanged: result.unchanged,
    skipped: result.skipped,
    renamedConceptKeys: [...result.renamedConceptKeys],
  };
}
