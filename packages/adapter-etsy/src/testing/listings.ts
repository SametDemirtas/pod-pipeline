import { productFamilyId, type NewListing } from '@pod/core';

/** A valid new listing of the sample t-shirt, with `overrides`. */
export const draft = (overrides: Partial<NewListing> = {}): NewListing => ({
  familyId: productFamilyId('t-shirt'),
  text: { title: 'Tulip Tee', description: 'Spooky.', tags: ['tulip shirt', 'halloween'] },
  price: 2499,
  currency: 'USD',
  shippingProfileId: '316',
  readinessStateId: '151',
  returnPolicyId: '1518',
  productionPartnerIds: ['77', '78'],
  ...overrides,
});

/** Etsy's answer to reading a shop that sells in US dollars. */
export const USD_SHOP = { body: { currency_code: 'USD' } };

/** The API path a request went to. */
export const path = (request: { url: string } | undefined) =>
  request?.url.split('/v3/application')[1];
