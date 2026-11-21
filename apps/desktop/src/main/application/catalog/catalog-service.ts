import type {
  CatalogApi,
  DesignDetailDto,
  DesignDto,
  DesignIdRequest,
  ImportPreviewDto,
  ImportProgressDto,
  ImportResultDto,
  ListDesignsRequest,
  PageDto,
  PreviewImportRequest,
  ProductFamilyDto,
  RunImportRequest,
} from '@pod/contracts';
import type {
  GetDesign,
  ImportPlanner,
  ListDesigns,
  ProductFamilyCatalog,
  RunImport,
} from '@pod/core';
import {
  toDesignDetailDto,
  toDesignPageDto,
  toImportPreviewDto,
  toImportResultDto,
} from '../dto/design-dtos.js';
import type { ImportFolderPolicy } from './import-folder-policy.js';
import { ImportInProgressError } from '../errors/catalog-errors.js';
import { ExclusiveRunner } from '../../shared/exclusive-runner.js';
import type { BatchApi } from '../batch/batch-service.js';
import type { ListingApi } from '../listing/listing-service.js';
import type { PrintApi } from '../print/print-service.js';
import type { PinApi } from '../pins/pin-service.js';
import type { ResearchApi } from '../research/research-service.js';

/** What the service reports while and after it works. */
export interface CatalogEvents {
  readonly importProgress: (progress: ImportProgressDto) => void;
  /** Designs or their mockups were added or changed. */
  readonly catalogChanged: () => void;
}

export interface CatalogServiceDeps {
  readonly families: Pick<ProductFamilyCatalog, 'all'>;
  readonly listDesigns: Pick<ListDesigns, 'execute'>;
  readonly getDesign: Pick<GetDesign, 'execute'>;
  readonly previewImport: ImportPlanner;
  readonly runImport: Pick<RunImport, 'execute'>;
  readonly folders: Pick<ImportFolderPolicy, 'resolveApproved'>;
  readonly events: CatalogEvents;
}

/** The catalog part of the API; the other services and the import folders serve the rest. */
type CatalogOperations = Omit<
  CatalogApi,
  | keyof PrintApi
  | keyof ListingApi
  | keyof ResearchApi
  | keyof PinApi
  | keyof BatchApi
  | 'listImportFolders'
>;

/** Adapts the core use cases to the transport-neutral catalog API. */
export class CatalogService implements CatalogOperations {
  private readonly importGuard = new ExclusiveRunner(() => new ImportInProgressError());

  constructor(private readonly deps: CatalogServiceDeps) {}

  listFamilies(): Promise<readonly ProductFamilyDto[]> {
    return Promise.resolve(this.deps.families.all().map((family) => ({ id: family.id })));
  }

  async listDesigns(request: ListDesignsRequest): Promise<PageDto<DesignDto>> {
    return toDesignPageDto(await this.deps.listDesigns.execute(request));
  }

  async getDesign(request: DesignIdRequest): Promise<DesignDetailDto> {
    return toDesignDetailDto(await this.deps.getDesign.execute(request.id));
  }

  previewImport(request: PreviewImportRequest): Promise<ImportPreviewDto> {
    return this.importGuard.run(async () => {
      const rootPath = await this.deps.folders.resolveApproved(request.rootPath);
      const preview = await this.deps.previewImport.execute(rootPath, (progress) => {
        this.deps.events.importProgress({ operation: 'preview', ...progress });
      });
      return toImportPreviewDto(preview);
    });
  }

  runImport(request: RunImportRequest): Promise<ImportResultDto> {
    return this.importGuard.run(async () => {
      const rootPath = await this.deps.folders.resolveApproved(request.rootPath);
      const result = await this.deps.runImport.execute({ ...request, rootPath }, (progress) => {
        this.deps.events.importProgress({ operation: 'import', ...progress });
      });
      this.deps.events.catalogChanged();
      return toImportResultDto(result);
    });
  }

  /** Refuses new imports and resolves once the one under way is done. */
  close(): Promise<void> {
    return this.importGuard.close();
  }
}
