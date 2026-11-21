/** The standard framing, which the scene rules also use when no shot size is chosen. */
export const HALF_FRAME =
  'centred and filling about half of the frame, with clear space on every side';

/**
 * What each look option adds to a scene prompt, by control, in the order they
 * are written. Every option keeps to what a front-facing product photo allows;
 * colour grades name the surroundings, warm light keeps the print's colours,
 * and blur never reaches the product. The option ids are kept with each scene,
 * so renaming one needs a migration.
 */
export const LOOK_FRAGMENTS = {
  shotSize: {
    hero: 'the product fills about two thirds of the frame, with a small margin on every side',
    standard: `the product ${HALF_FRAME}`,
    roomView:
      'a wider view of the setting, the product still the clear subject at about a third of the frame',
    printCloseUp:
      'a close crop on the printed area that shows the surface texture, with the whole print inside the frame',
  },
  cameraHeight: {
    eyeLevel: 'straight-on view at eye level',
    slightlyAbove: 'camera slightly above, looking down about 20 degrees',
    topDown:
      'top-down view from directly above; when the product is not worn or held, it lies flat',
  },
  lighting: {
    softDaylight: 'soft diffuse daylight from a large window to one side',
    studio: 'even soft studio light with gentle fill and no harsh shadows',
    warmLamp: 'warm lamp light with a cosy evening feel, the print keeps its true colours',
    hardSun:
      'crisp direct sunlight, its shadows falling beside the product, never across the print',
    moody: 'low-key light: one soft light on the product and a darker background',
  },
  timeOfDay: {
    morning: 'fresh morning light',
    midday: 'bright midday light',
    goldenHour: 'low golden-hour sunlight, the print keeps its true colours',
    blueHour: 'cool blue-hour light outside with warm lamps inside',
  },
  season: {
    spring: 'spring props such as fresh blossoms and pale green sprigs',
    summer: 'summer props such as citrus, shells or fresh greenery',
    autumn: 'autumn props such as fallen leaves, pine cones and warm knitwear',
    winter: 'winter holiday props such as evergreen sprigs and soft string lights',
  },
  backdrop: {
    fromPrint: 'a backdrop in a tone picked from the print',
    neutral: 'a warm white or light grey backdrop',
    contrast: 'a backdrop in a colour that contrasts with the print so it stands out',
  },
  blur: {
    strong: 'background strongly blurred, the product fully sharp',
    soft: 'background softly out of focus, the product fully sharp',
    none: 'deep focus, background and product both sharp',
  },
  grade: {
    cleanBright: 'bright, airy surroundings with a clean white balance',
    warm: 'warm, slightly golden tones in the surroundings',
    cool: 'cool, muted tones in the surroundings',
    film: 'a subtle film look in the surroundings: soft contrast and fine grain',
  },
  props: {
    bare: 'no props',
    minimal: 'one or two small props at the edges',
    styled: 'a few lifestyle props around the product, none touching or covering it',
  },
} as const;
