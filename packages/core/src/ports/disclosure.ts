/** Whether the seller makes designs with AI tools, which Etsy asks listings to disclose. */
export interface DesignDisclosure {
  designsMadeWithAi(): Promise<boolean>;
}
