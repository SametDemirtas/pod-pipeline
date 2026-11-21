import type {
  AiCatalogDto,
  ConnectionsDto,
  CreatedScenesDto,
  DesignDetailDto,
  DropboxAuthorizationDto,
  ImportProgressDto,
  KeywordListDto,
  KeywordListSummaryDto,
  ListingDto,
  ListingTextCheckDto,
  McpLaunchDto,
  MockupDto,
  PinDto,
  RotateDesignDto,
  SceneStyleDto,
  SettingsDto,
  TranslationsDto,
  UpscaleProgressDto,
  WrittenListingTextDto,
} from './dto.js';
import type { BatchEstimateDto, BatchListingTextDto, BatchStatusDto } from './dto/batch-dto.js';
import type { SceneLookPreviewDto } from './dto/scene-look.js';
import type {
  BatchRequest,
  CheckListingTextRequest,
  CheckSceneAgainRequest,
  ConfirmScenePrintRequest,
  ConnectAiRequest,
  CancelSignInRequest,
  ConnectPrintfulRequest,
  ConnectS3Request,
  ConnectSignInRequest,
  CreateSceneRequest,
  DescribeSceneStyleRequest,
  DesignIdRequest,
  DisconnectRequest,
  FamilyIdRequest,
  FinishDropboxRequest,
  ImportKeywordListRequest,
  KeywordListIdRequest,
  PinIdRequest,
  PlanPinRequest,
  PreviewSceneLookRequest,
  PublishPinNowRequest,
  RemoveImportFolderRequest,
  RemoveMockupRequest,
  SavePhotoRequest,
  StartDropboxRequest,
  TranslateListingTextRequest,
  UpdateSettingsRequest,
  WriteListingTextRequest,
} from './requests/index.js';
import type { CatalogApi } from './catalog-api.js';

/** Extra operations that only make sense inside the desktop window. */
export interface DesktopApi extends CatalogApi {
  pickFolder(): Promise<string | null>;
  /**
   * Lets the seller choose a CSV file exported from a keyword tool such as
   * eRank, and keeps its keywords as a list; `null` when cancelled.
   */
  importKeywordList(request: ImportKeywordListRequest): Promise<KeywordListDto | null>;
  /** The imported keyword lists, newest first. */
  listKeywordLists(): Promise<readonly KeywordListSummaryDto[]>;
  getKeywordList(request: KeywordListIdRequest): Promise<KeywordListDto>;
  /** Deletes an imported keyword list and resolves with the ones left. */
  removeKeywordList(request: KeywordListIdRequest): Promise<readonly KeywordListSummaryDto[]>;
  getSettings(): Promise<SettingsDto>;
  /** The AI services the settings may name, and their suggested models. */
  getAiCatalog(): Promise<AiCatalogDto>;
  updateSettings(request: UpdateSettingsRequest): Promise<SettingsDto>;
  removeImportFolder(request: RemoveImportFolderRequest): Promise<readonly string[]>;
  getConnections(): Promise<ConnectionsDto>;
  /** Checks the token with Printful before storing it. */
  connectPrintful(request: ConnectPrintfulRequest): Promise<ConnectionsDto>;
  /** Opens Dropbox in the browser, where the user allows access and copies a code. */
  startDropbox(request: StartDropboxRequest): Promise<DropboxAuthorizationDto>;
  finishDropbox(request: FinishDropboxRequest): Promise<ConnectionsDto>;
  /** Checks the bucket with a test upload before storing the keys. */
  connectS3(request: ConnectS3Request): Promise<ConnectionsDto>;
  /** Opens the service in the browser and resolves once the seller allowed access there. */
  connectSignIn(request: ConnectSignInRequest): Promise<ConnectionsDto>;
  /** Stops a running sign-in on the service; `connectSignIn` then fails as cancelled. */
  cancelSignIn(request: CancelSignInRequest): Promise<ConnectionsDto>;
  disconnect(request: DisconnectRequest): Promise<ConnectionsDto>;
  /** Checks the key with the AI service before storing it. */
  connectAi(request: ConnectAiRequest): Promise<ConnectionsDto>;
  /**
   * Has the chosen image service build a scene, or two candidates, around one of
   * Printful's photos, then the chosen text service compare each with it when
   * connected; the seller's keys are billed.
   */
  createScene(request: CreateSceneRequest): Promise<CreatedScenesDto>;
  /** Records that the seller checked a scene's print; only confirmed scenes go into a listing. */
  confirmScenePrint(request: ConfirmScenePrintRequest): Promise<MockupDto>;
  /**
   * Has the chosen text service compare a scene with its photo again. The seller's confirmation
   * stays unless the print is found changed.
   */
  checkSceneAgain(request: CheckSceneAgainRequest): Promise<MockupDto>;
  /**
   * Has the chosen text service describe the style of a reference photo as a scene for the design's
   * product; `null` when the seller cancelled choosing the file. The photo is not kept.
   */
  describeSceneStyle(request: DescribeSceneStyleRequest): Promise<SceneStyleDto | null>;
  /** The line a look adds to the scene prompt, and the look options offered for the product. */
  previewSceneLook(request: PreviewSceneLookRequest): Promise<SceneLookPreviewDto>;
  /** Deletes one photo of a design and resolves with the ones left. */
  removeMockup(request: RemoveMockupRequest): Promise<readonly MockupDto[]>;
  /** Saves the full-size photo where the seller picks; `false` when the dialog was cancelled. */
  savePhoto(request: SavePhotoRequest): Promise<boolean>;
  /** Has the chosen text service draft a listing's title, description and tags. */
  writeListingText(request: WriteListingTextRequest): Promise<WrittenListingTextDto>;
  /** Has the chosen text service translate a listing's words into other shop languages. */
  translateListingText(request: TranslateListingTextRequest): Promise<TranslationsDto>;
  /**
   * Trademarks a title or tags name, which Etsy may remove the listing for, and
   * phrases that read as machine-written.
   */
  checkListingText(request: CheckListingTextRequest): Promise<ListingTextCheckDto>;
  /** Makes the pin image and plans the pin; it goes out at `publishAt` while the app runs. */
  planPin(request: PlanPinRequest): Promise<PinDto>;
  /** Plans a pin an assistant proposed. */
  approvePin(request: PinIdRequest): Promise<PinDto>;
  /** Publishes a planned or failed pin on Pinterest right away. */
  publishPinNow(request: PublishPinNowRequest): Promise<PinDto>;
  /** Removes the pin from the app, not from Pinterest, and resolves with the design's others. */
  removePin(request: PinIdRequest): Promise<readonly PinDto[]>;
  /** Makes the listing public on Etsy, which charges a listing fee. Only a person may do this. */
  publishListing(request: DesignIdRequest): Promise<ListingDto>;
  /**
   * Makes the design's artwork four times larger on this computer and keeps it
   * as the next revision; the imported artwork stays as the one before.
   */
  upscaleDesign(request: DesignIdRequest): Promise<DesignDetailDto>;
  /**
   * Turns the design's artwork a quarter, as the checking model advises, when
   * its orientation is the other one than its print area's, e.g. portrait
   * artwork for a landscape blanket, and keeps it as the next revision.
   */
  rotateDesign(request: DesignIdRequest): Promise<RotateDesignDto>;
  /** The sizes a family's print provider product comes in, in its order; none for one size. */
  listFamilySizes(request: FamilyIdRequest): Promise<readonly string[]>;
  /** How to start the MCP server, for the settings that help connect an AI assistant. */
  getMcpLaunch(): Promise<McpLaunchDto>;
  /** What preparing listings for the chosen designs would do, before the seller confirms. */
  estimateBatch(request: BatchRequest): Promise<BatchEstimateDto>;
  /**
   * Starts preparing listings in the background, in place of the previous job;
   * one job runs at a time. Drafts stay unpublished.
   */
  startBatch(request: BatchRequest): Promise<BatchStatusDto>;
  /** Stops the job once the step running now is done; the rest can be resumed. */
  cancelBatch(): Promise<BatchStatusDto>;
  /** Carries on with the designs a paused or cancelled job has left. */
  resumeBatch(): Promise<BatchStatusDto>;
  /**
   * Runs the failed steps of the job again, and those they stopped, except
   * drafts that may be on Etsy already.
   */
  retryBatch(): Promise<BatchStatusDto>;
  /**
   * The seller checked the shop's drafts for a design whose draft may be on
   * Etsy, so its draft may be created again when the run goes on.
   */
  confirmDraftsChecked(request: DesignIdRequest): Promise<BatchStatusDto>;
  /** The listing text the latest job wrote for the design; `null` when it wrote none. */
  getBatchListingText(request: DesignIdRequest): Promise<BatchListingTextDto | null>;
  /** Returns a function that stops listening. */
  onImportProgress(listener: (progress: ImportProgressDto) => void): () => void;
  /** Fires after designs were added or changed, by this window or any other client. */
  onCatalogChanged(listener: () => void): () => void;
  /** Fires whenever the job of preparing listings moves on. */
  onBatchChanged(listener: (status: BatchStatusDto) => void): () => void;
  /** Fires as artwork is being made larger. */
  onUpscaleProgress(listener: (progress: UpscaleProgressDto) => void): () => void;
}
