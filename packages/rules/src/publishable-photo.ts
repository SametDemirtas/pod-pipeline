/** What decides whether a photo may be published. */
interface PhotoPublishing {
  /** `null` for a Printful mockup; the prompt for an AI scene. */
  readonly scenePrompt: string | null;
  /** The seller confirmed the print in the scene shows the design unchanged. */
  readonly printConfirmed: boolean;
}

/**
 * Whether the photo may go into a listing or a pin: a scene may show a changed
 * print, so only once the seller confirmed it.
 */
export function isPublishablePhoto(photo: PhotoPublishing): boolean {
  return photo.scenePrompt === null || photo.printConfirmed;
}
