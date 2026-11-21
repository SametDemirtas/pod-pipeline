/** A Printful store as the app checks it against the seller's Etsy shop. */
export interface PrintfulStoreInfo {
  readonly name: string;
  /** Whether the store syncs with the marketplace (Etsy); `null` when Printful did not say. */
  readonly syncsWithMarketplace: boolean | null;
  /** The Etsy shop's name in the store's address; `null` when the address shows none. */
  readonly shopHandle: string | null;
}

/** Reads one entry of Printful's `/stores` list. */
export function readPrintfulStore(entry: unknown): PrintfulStoreInfo {
  const store: Readonly<Record<string, unknown>> =
    typeof entry === 'object' && entry !== null ? (entry as Record<string, unknown>) : {};
  const text = (key: string) => {
    const value = store[key];
    return typeof value === 'string' && value ? value : null;
  };
  const type = text('type');
  return {
    name: text('name') ?? 'Printful',
    syncsWithMarketplace: type === null ? null : type.toLowerCase() === 'etsy',
    shopHandle: etsyShopHandle(text('website') ?? ''),
  };
}

/** The shop's name in an Etsy address: etsy.com/shop/<name>, or <name>.etsy.com. */
function etsyShopHandle(website: string): string | null {
  const path = /etsy\.com\/(?:[a-z-]+\/)?shop\/([^/?#]+)/i.exec(website)?.[1];
  const host = /^(?:https?:\/\/)?([^./]+)\.etsy\.com/i.exec(website)?.[1];
  const handle = path ?? (host?.toLowerCase() === 'www' ? undefined : host);
  return handle === undefined ? null : decoded(handle);
}

/** The address part as written when it is not a valid escape. */
function decoded(part: string): string {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}
