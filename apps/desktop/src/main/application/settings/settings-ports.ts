import type {
  ArtworkSharing,
  DesignDisclosure,
  ProductFacts,
  ProductFactsSource,
  ProductFamilyId,
} from '@pod/core';
import type { SettingsStore } from './settings-store.js';

const NO_FACTS: ProductFacts = { material: '', care: '', fit: '', size: '' };

/** What the core reads from the seller's settings, read afresh on every call. */
export class SettingsPorts implements ArtworkSharing, DesignDisclosure, ProductFactsSource {
  constructor(private readonly settings: Pick<SettingsStore, 'get'>) {}

  /** Whether the seller lets phone case files also make Samsung cases. */
  async shared(): Promise<boolean> {
    return (await this.settings.get()).samsungFromIphone;
  }

  /** Whether the seller said their designs are made with AI tools. */
  async designsMadeWithAi(): Promise<boolean> {
    return (await this.settings.get()).aiDesigns;
  }

  /** The product facts the seller keeps for the family, for whoever writes listings. */
  async factsFor(familyId: ProductFamilyId): Promise<ProductFacts> {
    return (await this.settings.get()).productFacts[familyId] ?? NO_FACTS;
  }
}
