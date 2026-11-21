import type {
  CatalogApi,
  DesignIdRequest,
  FamilyIdRequest,
  MockupDto,
  PrintCheckDto,
  PrintRequest,
} from '@pod/contracts';
import {
  productFamilyId,
  type CheckDesignPrint,
  type CreateMockups,
  type DesignId,
  type MockupRepository,
  type PrintCatalog,
  type ProductFactsSource,
} from '@pod/core';
import { MockupsInProgressError } from '../errors/print-errors.js';
import type { CatalogEvents } from '../catalog/catalog-service.js';
import { toMockupDto, toPrintCheckDto } from '../dto/print-dtos.js';
import { ExclusiveRunner } from '../../shared/exclusive-runner.js';

export type PrintApi = Pick<CatalogApi, 'checkPrint' | 'createMockups' | 'listMockups'>;

export interface PrintServiceDeps {
  readonly checkPrint: Pick<CheckDesignPrint, 'execute'>;
  readonly printCatalog: PrintCatalog;
  /** Sent with each check, so an assistant writing the listing knows what it may claim. */
  readonly facts: ProductFactsSource;
  readonly createMockups: Pick<CreateMockups, 'execute'>;
  readonly mockups: Pick<MockupRepository, 'listForDesign'>;
  readonly events: Pick<CatalogEvents, 'catalogChanged'>;
}

/** Adapts the print use cases to the transport-neutral API. */
export class PrintService implements PrintApi {
  // Printful renders slowly and limits how many tasks may run, so one at a time.
  private readonly mockupRunner = new ExclusiveRunner(() => new MockupsInProgressError());

  constructor(private readonly deps: PrintServiceDeps) {}

  async checkPrint(request: PrintRequest): Promise<PrintCheckDto> {
    const check = await this.deps.checkPrint.execute(request);
    return toPrintCheckDto(check, await this.deps.facts.factsFor(check.design.familyId));
  }

  createMockups(request: PrintRequest): Promise<readonly MockupDto[]> {
    return this.mockupRunner.run(async () => {
      const mockups = await this.deps.createMockups.execute(request);
      this.deps.events.catalogChanged();
      return mockups.map(toMockupDto);
    });
  }

  /** Refuses new mockups and resolves once those under way are stored. */
  close(): Promise<void> {
    return this.mockupRunner.close();
  }

  /** Window only: the sizes the settings may choose from for a family's listings. */
  async listFamilySizes(request: FamilyIdRequest): Promise<readonly string[]> {
    const product = await this.deps.printCatalog.findProduct(productFamilyId(request.familyId));
    const sizes = (product?.variants ?? []).map((variant) => variant.size);
    return [...new Set(sizes.filter((size): size is string => size !== null))];
  }

  async listMockups(request: DesignIdRequest): Promise<readonly MockupDto[]> {
    return (await this.deps.mockups.listForDesign(request.id as DesignId)).map(toMockupDto);
  }
}
