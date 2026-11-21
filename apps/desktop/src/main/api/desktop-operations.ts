import {
  batchRequest,
  familyIdRequest,
  cancelSignInRequest,
  connectAiRequest,
  connectPrintfulRequest,
  connectS3Request,
  connectSignInRequest,
  checkSceneAgainRequest,
  confirmScenePrintRequest,
  createSceneRequest,
  describeSceneStyleRequest,
  previewSceneLookRequest,
  designIdRequest,
  disconnectRequest,
  finishDropboxRequest,
  importKeywordListRequest,
  keywordListIdRequest,
  pinIdRequest,
  publishPinNowRequest,
  planPinRequest,
  removeImportFolderRequest,
  removeMockupRequest,
  savePhotoRequest,
  startDropboxRequest,
  translateListingTextRequest,
  checkListingTextRequest,
  updateSettingsRequest,
  writeListingTextRequest,
  type CatalogApi,
  type AiCatalogDto,
  type McpLaunchDto,
} from '@pod/contracts';
import type { BatchService } from '../application/batch/batch-service.js';
import type { ConnectionsService } from '../application/connections/connections-service.js';
import type { ImportFolderService } from '../application/catalog/import-folder-service.js';
import type { KeywordListService } from '../application/research/keyword-list-service.js';
import type { ListingService } from '../application/listing/listing-service.js';
import type { PhotoService } from '../application/photos/photo-service.js';
import type { PinService } from '../application/pins/pin-service.js';
import type { PrintService } from '../application/print/print-service.js';
import type { SceneService } from '../application/scenes/scene-service.js';
import type { TextService } from '../application/listing/text-service.js';
import type { SettingsStore } from '../application/settings/settings-store.js';
import type { UpscaleService } from '../application/print/upscale-service.js';
import type { RotationService } from '../application/print/rotation-service.js';

import { catalogOperations, withInput, withoutInput, type Operation } from './operations.js';

/**
 * What the window may call besides the catalog. Assistants reach only the
 * catalog, so whatever bills the seller or changes their setup is here.
 */
export interface WindowServices {
  /** Everything any client may call: the window, and assistants through the local API. */
  readonly catalog: CatalogApi;
  readonly settings: Pick<SettingsStore, 'get' | 'update'>;
  /** The AI services the settings may name, and their suggested models. */
  readonly aiCatalog: AiCatalogDto;
  /** Approving and removing import folders is the window's alone. */
  readonly folders: Pick<ImportFolderService, 'choose' | 'remove'>;
  /** Importing keyword files from the seller's disk is the window's alone. */
  readonly keywords: Pick<
    KeywordListService,
    'importKeywordList' | 'listKeywordLists' | 'getKeywordList' | 'removeKeywordList'
  >;
  readonly connections: Connections;
  /** Publishing costs the seller a fee, so only the window offers it. */
  readonly publishing: Pick<ListingService, 'publishListing'>;
  /** Listing text is written with the seller's key, so only the window offers it. */
  readonly text: Pick<
    TextService,
    'writeListingText' | 'translateListingText' | 'checkListingText'
  >;
  /** Scenes are billed to the seller's key, so only the window offers them. */
  readonly scenes: Scenes;
  /** Removing a photo, or saving it elsewhere on the seller's computer, is the window's alone. */
  readonly photos: Pick<PhotoService, 'removeMockup' | 'savePhoto'>;
  /** Planning, approving and publishing pins; assistants may only propose them. */
  readonly pins: Pins;
  /** Preparing listings bills the seller's AI key, so only the window starts or changes it. */
  readonly batch: Batch;
  /** The sizes the settings choose from are read for the window alone. */
  readonly print: Pick<PrintService, 'listFamilySizes'>;
  /** Upscaling runs on the seller's computer for minutes, so only the window starts it. */
  readonly upscale: Pick<UpscaleService, 'upscaleDesign'>;
  /** Turning artwork asks the seller's checking model, so only the window starts it on its own. */
  readonly rotation: Pick<RotationService, 'rotateDesign'>;
}

export interface DesktopOperationDeps extends WindowServices {
  readonly mcpLaunch: () => McpLaunchDto;
}

/** Everything the desktop window may do: the catalog plus window-only operations. */
export function desktopOperations(deps: DesktopOperationDeps): Operation[] {
  return [
    ...catalogOperations(deps.catalog),
    withoutInput('pickFolder', () => deps.folders.choose()),
    withInput('importKeywordList', importKeywordListRequest, (input) =>
      deps.keywords.importKeywordList(input),
    ),
    withoutInput('listKeywordLists', () => deps.keywords.listKeywordLists()),
    withInput('getKeywordList', keywordListIdRequest, (input) =>
      deps.keywords.getKeywordList(input),
    ),
    withInput('removeKeywordList', keywordListIdRequest, (input) =>
      deps.keywords.removeKeywordList(input),
    ),
    withoutInput('getMcpLaunch', () => Promise.resolve(deps.mcpLaunch())),
    withInput('listFamilySizes', familyIdRequest, (input) => deps.print.listFamilySizes(input)),
    withInput('upscaleDesign', designIdRequest, (input) => deps.upscale.upscaleDesign(input)),
    withInput('rotateDesign', designIdRequest, (input) => deps.rotation.rotateDesign(input)),
    withoutInput('getSettings', () => deps.settings.get()),
    withoutInput('getAiCatalog', () => Promise.resolve(deps.aiCatalog)),
    withInput('updateSettings', updateSettingsRequest, (input) => deps.settings.update(input)),
    withInput('removeImportFolder', removeImportFolderRequest, (input) =>
      deps.folders.remove(input.folder),
    ),
    withInput('publishListing', designIdRequest, (input) => deps.publishing.publishListing(input)),
    withInput('writeListingText', writeListingTextRequest, (input) =>
      deps.text.writeListingText(input),
    ),
    withInput('translateListingText', translateListingTextRequest, (input) =>
      deps.text.translateListingText(input),
    ),
    withInput('checkListingText', checkListingTextRequest, (input) =>
      deps.text.checkListingText(input),
    ),
    ...sceneOperations(deps.scenes),
    withInput('removeMockup', removeMockupRequest, (input) => deps.photos.removeMockup(input)),
    withInput('savePhoto', savePhotoRequest, (input) => deps.photos.savePhoto(input)),
    ...pinOperations(deps.pins),
    ...batchOperations(deps.batch),
    ...connectionOperations(deps.connections),
  ];
}

type Scenes = Pick<
  SceneService,
  | 'createScene'
  | 'confirmScenePrint'
  | 'checkSceneAgain'
  | 'describeSceneStyle'
  | 'previewSceneLook'
>;

function sceneOperations(scenes: Scenes): Operation[] {
  return [
    withInput('createScene', createSceneRequest, (input) => scenes.createScene(input)),
    withInput('confirmScenePrint', confirmScenePrintRequest, (input) =>
      scenes.confirmScenePrint(input),
    ),
    withInput('checkSceneAgain', checkSceneAgainRequest, (input) => scenes.checkSceneAgain(input)),
    withInput('describeSceneStyle', describeSceneStyleRequest, (input) =>
      scenes.describeSceneStyle(input),
    ),
    withInput('previewSceneLook', previewSceneLookRequest, (input) =>
      scenes.previewSceneLook(input),
    ),
  ];
}

type Pins = Pick<PinService, 'planPin' | 'approvePin' | 'publishPinNow' | 'removePin'>;

function pinOperations(pins: Pins): Operation[] {
  return [
    withInput('planPin', planPinRequest, (input) => pins.planPin(input)),
    withInput('approvePin', pinIdRequest, (input) => pins.approvePin(input)),
    withInput('publishPinNow', publishPinNowRequest, (input) => pins.publishPinNow(input)),
    withInput('removePin', pinIdRequest, (input) => pins.removePin(input)),
  ];
}

type Batch = Pick<
  BatchService,
  | 'estimateBatch'
  | 'startBatch'
  | 'cancelBatch'
  | 'resumeBatch'
  | 'retryBatch'
  | 'confirmDraftsChecked'
  | 'getBatchListingText'
>;

function batchOperations(batch: Batch): Operation[] {
  return [
    withInput('estimateBatch', batchRequest, (input) => batch.estimateBatch(input)),
    withInput('startBatch', batchRequest, (input) => batch.startBatch(input)),
    withoutInput('cancelBatch', () => batch.cancelBatch()),
    withoutInput('resumeBatch', () => batch.resumeBatch()),
    withoutInput('retryBatch', () => batch.retryBatch()),
    withInput('confirmDraftsChecked', designIdRequest, (input) =>
      batch.confirmDraftsChecked(input),
    ),
    withInput('getBatchListingText', designIdRequest, (input) => batch.getBatchListingText(input)),
  ];
}

type Connections = Pick<
  ConnectionsService,
  | 'get'
  | 'connectPrintful'
  | 'startDropbox'
  | 'finishDropbox'
  | 'connectS3'
  | 'connectSignIn'
  | 'cancelSignIn'
  | 'connectAi'
  | 'disconnect'
>;

function connectionOperations(connections: Connections): Operation[] {
  return [
    withoutInput('getConnections', () => connections.get()),
    withInput('connectPrintful', connectPrintfulRequest, (input) =>
      connections.connectPrintful(input),
    ),
    withInput('startDropbox', startDropboxRequest, (input) => connections.startDropbox(input)),
    withInput('finishDropbox', finishDropboxRequest, (input) => connections.finishDropbox(input)),
    withInput('connectS3', connectS3Request, (input) => connections.connectS3(input)),
    withInput('connectSignIn', connectSignInRequest, (input) => connections.connectSignIn(input)),
    withInput('cancelSignIn', cancelSignInRequest, (input) => connections.cancelSignIn(input)),
    withInput('connectAi', connectAiRequest, (input) => connections.connectAi(input)),
    withInput('disconnect', disconnectRequest, (input) => connections.disconnect(input)),
  ];
}
