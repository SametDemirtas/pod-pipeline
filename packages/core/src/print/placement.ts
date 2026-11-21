const FIT_MODES = ['contain', 'cover'] as const;
/** `contain` shows the whole image inside the area; `cover` fills the area and crops. */
export type FitMode = (typeof FIT_MODES)[number];

export interface Size {
  readonly width: number;
  readonly height: number;
}

/** Where the image lands, in pixels of the print area; `cover` may start above or left of it. */
export interface Placement {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export function isFitMode(value: string): value is FitMode {
  return (FIT_MODES as readonly string[]).includes(value);
}

/** How much the image is scaled to fit the area, keeping its aspect ratio. */
export function scaleFor(image: Size, area: Size, fit: FitMode): number {
  const scaleX = area.width / image.width;
  const scaleY = area.height / image.height;
  return fit === 'contain' ? Math.min(scaleX, scaleY) : Math.max(scaleX, scaleY);
}

/** Scales the image to the area, keeping its aspect ratio, and centres it. */
export function placeImage(image: Size, area: Size, fit: FitMode): Placement {
  const scale = scaleFor(image, area, fit);
  const width = Math.round(image.width * scale);
  const height = Math.round(image.height * scale);
  return {
    left: Math.round((area.width - width) / 2),
    top: Math.round((area.height - height) / 2),
    width,
    height,
  };
}
