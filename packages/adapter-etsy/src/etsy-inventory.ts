import type { ListingProduct } from '@pod/core';
import { EtsyRequestError } from './errors.js';

/**
 * Etsy's ids for the two variation properties a seller may name freely. Every
 * product names its properties in the same order, colour before size, as the
 * core builds them, so the n-th property of each product is the same variation.
 */
const CUSTOM_PROPERTY_IDS = [513, 514];
/** Made to order, so stock never runs out; Etsy caps quantity at 999. */
export const QUANTITY = 999;

export interface InventoryOptions {
  readonly readinessStateId: string;
  /** Turns a price in the currency's minor unit into Etsy's decimal. */
  readonly decimal: (amount: number) => string;
}

interface InventoryProduct {
  readonly sku: string;
  readonly property_values: readonly {
    readonly property_id: number | undefined;
    readonly property_name: string;
    readonly values: readonly string[];
  }[];
  readonly offerings: readonly {
    readonly price: number;
    readonly quantity: number;
    readonly is_enabled: boolean;
    readonly readiness_state_id: number;
  }[];
}

/** The body of Etsy's updateListingInventory. */
interface EtsyInventory {
  readonly products: readonly InventoryProduct[];
  readonly price_on_property: readonly (number | undefined)[];
  readonly quantity_on_property: readonly number[];
  readonly sku_on_property: readonly number[];
  readonly readiness_state_on_property: readonly number[];
}

/** The body of Etsy's updateListingInventory for the given products. */
export function inventoryOf(
  products: readonly ListingProduct[],
  options: InventoryOptions,
): EtsyInventory {
  const count = products[0]?.properties.length ?? 0;
  if (count > CUSTOM_PROPERTY_IDS.length) {
    throw new EtsyRequestError(
      `Etsy allows ${String(CUSTOM_PROPERTY_IDS.length)} variations, not ${String(count)}`,
    );
  }
  const propertyIds = CUSTOM_PROPERTY_IDS.slice(0, count);
  const entry = (product: ListingProduct, enabled: boolean): InventoryProduct => ({
    sku: product.sku,
    property_values: product.properties.map((property, index) => ({
      property_id: CUSTOM_PROPERTY_IDS[index],
      property_name: property.name,
      values: [property.value],
    })),
    offerings: [
      {
        price: Number(options.decimal(product.price)),
        quantity: QUANTITY,
        is_enabled: enabled,
        readiness_state_id: Number(options.readinessStateId),
      },
    ],
  });
  const fillers = missingCombinations(products);
  return {
    products: [
      ...products.map((product) => entry(product, true)),
      ...fillers.map((product) => entry(product, false)),
    ],
    // Fillers count too: Etsy checks every product against price_on_property.
    price_on_property: priceProperties([...products, ...fillers], propertyIds),
    quantity_on_property: [],
    sku_on_property: propertyIds,
    readiness_state_on_property: [],
  };
}

/**
 * The properties prices depend on: none when all are equal, the one whose
 * value decides the price (such as size) when there is one, else both.
 */
function priceProperties(products: readonly ListingProduct[], propertyIds: readonly number[]) {
  if (new Set(products.map((product) => product.price)).size <= 1) return [];
  const decides = (index: number) => {
    const priceOf = new Map<string, number>();
    return products.every((product) => {
      const value = product.properties[index]?.value ?? '';
      const known = priceOf.get(value);
      priceOf.set(value, product.price);
      return known === undefined || known === product.price;
    });
  };
  // Prices come from sizes, the last property, so that one is tried first.
  const deciding = [...propertyIds.keys()].reverse().find((index) => decides(index));
  return deciding === undefined ? [...propertyIds] : [propertyIds[deciding]];
}

/**
 * Etsy expects every colour and size pairing; the ones not offered are added
 * switched off and without a SKU, so buyers cannot pick them. They take the
 * price of an offered product of the same size, so size prices stay consistent.
 */
function missingCombinations(products: readonly ListingProduct[]): ListingProduct[] {
  const first = products[0];
  if (first?.properties.length !== 2) return [];
  const [colorName = '', sizeName = ''] = first.properties.map((property) => property.name);
  const valueAt = (product: ListingProduct, index: number) =>
    product.properties[index]?.value ?? '';
  const valuesAt = (index: number) => [...new Set(products.map((p) => valueAt(p, index)))];
  const offered = new Set(products.map((p) => `${valueAt(p, 0)}\u0000${valueAt(p, 1)}`));
  const priceFor = (size: string) => (products.find((p) => valueAt(p, 1) === size) ?? first).price;

  return valuesAt(0).flatMap((color) =>
    valuesAt(1)
      .filter((size) => !offered.has(`${color}\u0000${size}`))
      .map((size) => ({
        sku: '',
        price: priceFor(size),
        properties: [
          { name: colorName, value: color },
          { name: sizeName, value: size },
        ],
      })),
  );
}
