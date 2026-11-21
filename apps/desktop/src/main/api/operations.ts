import type { z, ZodType } from 'zod';
import {
  createListingRequest,
  designIdRequest,
  linkListingRequest,
  replaceListingPhotosRequest,
  listDesignsRequest,
  planPinRequest,
  previewImportRequest,
  printRequest,
  researchIdRequest,
  researchRequest,
  runImportRequest,
  type CatalogApi,
  type IPC_CHANNELS,
} from '@pod/contracts';

export type OperationName = keyof typeof IPC_CHANNELS;

/** One API operation: validates its raw argument, then runs. Transport-neutral. */
export interface Operation {
  readonly name: OperationName;
  readonly handle: (raw: unknown) => Promise<unknown>;
}

export function withInput<S extends ZodType>(
  name: OperationName,
  schema: S,
  handle: (input: z.infer<S>) => Promise<unknown>,
): Operation {
  // Parsing inside the chain turns invalid input into a rejection, never a throw.
  return {
    name,
    handle: (raw) => Promise.resolve(raw).then((value) => handle(schema.parse(value))),
  };
}

export function withoutInput(name: OperationName, handle: () => Promise<unknown>): Operation {
  return { name, handle: () => handle() };
}

/** Operations any client may use: the window, and AI assistants through the local API. */
export function catalogOperations(catalog: CatalogApi): Operation[] {
  return [
    withoutInput('listFamilies', () => catalog.listFamilies()),
    withInput('listDesigns', listDesignsRequest, (input) => catalog.listDesigns(input)),
    withInput('getDesign', designIdRequest, (input) => catalog.getDesign(input)),
    withInput('previewImport', previewImportRequest, (input) => catalog.previewImport(input)),
    withInput('runImport', runImportRequest, (input) => catalog.runImport(input)),
    withoutInput('listImportFolders', () => catalog.listImportFolders()),
    withInput('checkPrint', printRequest, (input) => catalog.checkPrint(input)),
    withInput('createMockups', printRequest, (input) => catalog.createMockups(input)),
    withInput('listMockups', designIdRequest, (input) => catalog.listMockups(input)),
    withoutInput('getShopOptions', () => catalog.getShopOptions()),
    withInput('getListing', designIdRequest, (input) => catalog.getListing(input)),
    withInput('createListing', createListingRequest, (input) => catalog.createListing(input)),
    withInput('linkListing', linkListingRequest, (input) => catalog.linkListing(input)),
    withInput('refreshListing', designIdRequest, (input) => catalog.refreshListing(input)),
    withInput('listingPhotos', designIdRequest, (input) => catalog.listingPhotos(input)),
    withInput('replaceListingPhotos', replaceListingPhotosRequest, (input) =>
      catalog.replaceListingPhotos(input),
    ),
    withInput('researchKeywords', researchRequest, (input) => catalog.researchKeywords(input)),
    withoutInput('listResearch', () => catalog.listResearch()),
    withInput('getResearch', researchIdRequest, (input) => catalog.getResearch(input)),
    withoutInput('listBoards', () => catalog.listBoards()),
    withInput('listPins', designIdRequest, (input) => catalog.listPins(input)),
    withInput('proposePin', planPinRequest, (input) => catalog.proposePin(input)),
    withoutInput('getBatchStatus', () => catalog.getBatchStatus()),
  ];
}
