import type {
  CreatedListingDto,
  DesignDetailDto,
  DesignDto,
  ImportPreviewDto,
  ImportResultDto,
  ListingDto,
  LiveListingPhotosDto,
  MockupDto,
  PageDto,
  PinDto,
  BoardDto,
  PrintCheckDto,
  ProductFamilyDto,
  ResearchRunDto,
  ResearchSummaryDto,
  ShopOptionsDto,
} from './dto.js';
import type { BatchStatusDto } from './dto/batch-dto.js';
import type {
  CreateListingRequest,
  DesignIdRequest,
  LinkListingRequest,
  ListDesignsRequest,
  PlanPinRequest,
  PreviewImportRequest,
  PrintRequest,
  ReplaceListingPhotosRequest,
  ResearchIdRequest,
  ResearchRequest,
  RunImportRequest,
} from './requests/index.js';

/** Operations available to any client: the desktop UI, the local HTTP API and MCP. */
export interface CatalogApi {
  listFamilies(): Promise<readonly ProductFamilyDto[]>;
  listDesigns(request: ListDesignsRequest): Promise<PageDto<DesignDto>>;
  getDesign(request: DesignIdRequest): Promise<DesignDetailDto>;
  /** Only folders listed by `listImportFolders`, or folders inside them, are accepted. */
  previewImport(request: PreviewImportRequest): Promise<ImportPreviewDto>;
  runImport(request: RunImportRequest): Promise<ImportResultDto>;
  /** Folders the user approved for importing by choosing them in the app. */
  listImportFolders(): Promise<readonly string[]>;
  /** How the current revision of a design prints on a variant of its product. */
  checkPrint(request: PrintRequest): Promise<PrintCheckDto>;
  /**
   * Has Printful photograph the design on a variant and keeps the photos. Takes up
   * to two minutes; the design is shared through the connected file host meanwhile.
   */
  createMockups(request: PrintRequest): Promise<readonly MockupDto[]>;
  /** Newest first. */
  listMockups(request: DesignIdRequest): Promise<readonly MockupDto[]>;
  /** Shipping profiles and other settings a listing in the connected Etsy shop needs. */
  getShopOptions(): Promise<ShopOptionsDto>;
  /** The design's Etsy listing, or `null` when it has none. */
  getListing(request: DesignIdRequest): Promise<ListingDto | null>;
  /** Creates an unpublished Etsy listing with variations and photos. Free; nothing is public. */
  createListing(request: CreateListingRequest): Promise<CreatedListingDto>;
  /**
   * Tells Printful which product and print file each variant of the listing is.
   * Printful must have imported the listing from the shop first.
   */
  linkListing(request: LinkListingRequest): Promise<ListingDto>;
  /**
   * Reads the listing's state on Etsy, where the seller may have published,
   * paused or deleted it. `null` when it was deleted; the design can then get a new one.
   */
  refreshListing(request: DesignIdRequest): Promise<ListingDto | null>;
  /**
   * Reads the photos the Etsy listing shows and the pictures Printful keeps of
   * the linked files, to see what went out before publishing. Changes nothing.
   */
  listingPhotos(request: DesignIdRequest): Promise<LiveListingPhotosDto>;
  /**
   * Replaces the photos of the design's Etsy draft with the chosen Printful
   * photos, e.g. after making the mockups again. Only an unpublished draft;
   * scene photos are refused, since only a new draft gets the AI note for them.
   */
  replaceListingPhotos(request: ReplaceListingPhotosRequest): Promise<ListingDto>;
  /**
   * Searches Etsy signed out, in a hidden browser window that opens only when
   * Etsy asks a person to prove they are searching, and counts what the
   * results say. The run is kept.
   */
  researchKeywords(request: ResearchRequest): Promise<ResearchRunDto>;
  /** The latest research runs, newest first. */
  listResearch(): Promise<readonly ResearchSummaryDto[]>;
  getResearch(request: ResearchIdRequest): Promise<ResearchRunDto>;
  /** Boards of the connected Pinterest account, to plan pins on. */
  listBoards(): Promise<readonly BoardDto[]>;
  /** The design's pins, soonest first. */
  listPins(request: DesignIdRequest): Promise<readonly PinDto[]>;
  /**
   * Makes the pin image and proposes the pin. Nothing is published until the
   * seller approves it in the app; it then goes out at `publishAt`.
   */
  proposePin(request: PlanPinRequest): Promise<PinDto>;
  /**
   * How far preparing listings for many designs got. Only the window starts it,
   * since it bills the seller's AI key.
   */
  getBatchStatus(): Promise<BatchStatusDto>;
}
