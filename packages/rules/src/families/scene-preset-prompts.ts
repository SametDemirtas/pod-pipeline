import type { SceneKind } from './scene-kinds.js';

/**
 * Ready-made scenes of one product family, by kind and name. The prompts stay
 * in English whatever the app's language, as the image model follows English
 * best; only their short names are translated. Each keeps to angles a
 * front-facing product photo allows, so the print need not be drawn anew.
 */
export type FamilyPresets = Partial<Record<SceneKind, Readonly<Record<string, string>>>>;

const APPAREL_MARKETING = {
  floating:
    'Show the garment floating flat and front-on against a smooth gradient backdrop in a tone that complements the print, a soft shadow on the backdrop behind it, even studio light, straight-on shot, clean premium campaign look with calm empty space around it.',
  ghost:
    'Show the garment front-on as if worn by an invisible body, with natural volume through the chest and shoulders, the neckline and sleeves as in the photo, no person, mannequin, stand or hanger in view, pure white background, soft even studio light, straight-on eye-level shot.',
  colorBlock:
    'Lay the garment flat, front up and smooth, across a two-tone colour-block paper backdrop in shades picked from the print, crisp sunny light with leaf shadows falling on the backdrop only, top-down shot, bold summer campaign look with empty space on one side for a headline.',
};

const ARTWORK_FLOATING =
  'Show the artwork floating flat and front-on against a smooth gradient backdrop in a tone that complements it, a soft shadow on the backdrop behind it, even studio light, straight-on shot, the artwork parallel to the camera, clean premium campaign look.';

/** iPhone and Samsung cases look and are held alike. */
export const PHONE_CASE_SCENES = {
  product: {
    inHand:
      'Show the phone in its case held by its sides between thumb and fingers, an outdoor café softly blurred behind, natural daylight, back of the case facing the camera, 50mm shot.',
    flatLay:
      'Lay the phone in its case face down on a linen surface with earbuds, a coffee cup and keys around it, soft overhead daylight, top-down shot, case design fully visible.',
    desk: 'Lean the phone in its case against a stack of books on a minimalist desk with a small plant, back of the case facing the camera, soft window light, eye-level close shot, shallow depth of field.',
    gift: 'Place the phone in its case, back of the case facing up, on tissue paper in an open gift box with a ribbon and a sprig of eucalyptus, soft warm light, slight high angle.',
  },
  marketing: {
    studio:
      'Stand the phone in its case upright on a seamless pure white sweep, back of the case facing the camera, soft even three-point studio lighting, a faint contact shadow beneath it, straight-on eye-level shot, generous empty space around it.',
    spotlight:
      'Stand the phone in its case upright on a low matte plinth against a smooth gradient backdrop in a colour that complements the design, back of the case facing the camera, a soft key light from above left and a gentle rim light, straight-on shot, calm empty space above for a headline.',
    colorBlock:
      'Lean the phone in its case against stacked pastel geometric blocks in tones picked from the design, back of the case facing the camera, one warm sunny light casting a crisp shadow on the backdrop, straight-on eye-level shot, playful modern campaign look.',
  },
  model: {
    holding:
      'A man in his twenties with short dreadlocks, in a plain navy sweater, holds the phone in its case by its sides between thumb and fingers at chest height, the back of the case to the camera, his face softly out of focus above it, bright window light, 85mm close shot.',
    onTheGo:
      'A woman in her sixties with silver hair, in a plain beige coat, reads her phone on a sunny city street, holding it by its sides between thumb and fingers so the back of the case faces the camera, 50mm eye-level medium shot, street softly blurred behind. Naturally asymmetric details: the right eye sitting fractionally lower than the left, faint asymmetry at the lip corners.',
  },
} as const satisfies FamilyPresets;

export const MUG_SCENES = {
  product: {
    kitchen:
      'Place the mug from the photo on a light oak kitchen counter beside a small plant and an open notebook, soft morning window light from the left, steam above the rim, clear of the print, 50mm eye-level shot, shallow depth of field.',
    inHand:
      'Show the mug centred in the frame, held loosely by its handle in one hand reaching in from the frame edge, over a cosy knit blanket on a sofa, warm lamp light, the print facing the camera fully unobstructed, eye-level close shot.',
    stillLife:
      'Set the mug on a white marble surface with scattered coffee beans and a linen napkin, bright diffuse daylight, slight high angle, clean minimal styling, true-to-life colours.',
    gift: 'Place the mug on a rustic wooden table with kraft gift wrap, twine and a few pine sprigs, fairy lights softly blurred behind, warm evening light, eye-level 85mm shot.',
  },
  marketing: {
    studio:
      'Stand the mug alone on a seamless pure white sweep, soft even three-point studio lighting, a faint contact shadow beneath it, straight-on eye-level shot, generous empty space around it, crisp focus throughout.',
    spotlight:
      'Stand the mug on a low matte plinth against a smooth gradient backdrop in a colour that complements the print, a soft key light from above left and a gentle rim light separating it from the background, a subtle reflection on the plinth, straight-on eye-level shot, calm empty space above for a headline.',
    colorBlock:
      'Stand the mug on stacked pastel geometric blocks in tones picked from the print, one warm sunny light casting a crisp shadow on the backdrop, straight-on eye-level shot, playful modern campaign look.',
  },
  model: {
    holding:
      'A man in his fifties with short grey hair, in a plain knit sweater, holds the mug by its handle at chest height, the print turned to the camera with his fingers clear of it, a friendly half-smile, a bright kitchen softly blurred behind, soft window light, 85mm medium close shot. Naturally asymmetric details: the right eye sitting fractionally lower than the left, one brow marginally higher than the other.',
    cafe: 'A Black woman in her twenties with natural curly hair, in a plain cream top, sits at a sunny café table and lifts the mug by its handle, the print facing the camera, a relaxed smile, warm daylight, 50mm eye-level shot, café interior softly blurred.',
  },
} as const satisfies FamilyPresets;

export const T_SHIRT_SCENES = {
  product: {
    flatLay:
      'Lay the t-shirt flat, neatly smoothed, on a pale linen bedspread with sunglasses, the corner of a denim jacket and a coffee cup at the edges, soft daylight from above, top-down shot, print fully visible.',
    hanger:
      'Hang the t-shirt on a natural wood hanger against a warm white plaster wall with a small rail and a trailing plant, soft side window light, straight-on eye-level shot.',
    gift: 'Lay the t-shirt flat, front up and smooth, beside an open kraft gift box with tissue paper and a ribbon on a light wood table, soft diffuse light, top-down shot, print fully visible.',
    terrace:
      'Drape the t-shirt over the back of a wooden café chair on a sunny terrace, greenery softly blurred behind, late afternoon golden light, eye-level 50mm shot, natural folds only away from the print.',
  },
  marketing: {
    ...APPAREL_MARKETING,
    outfit:
      'Lay the t-shirt flat, front up and smooth, as the top of a styled outfit on light oak boards, folded jeans below it, plain sneakers and sunglasses beside it, nothing overlapping the shirt, even diffused daylight, top-down shot.',
  },
  model: {
    onModel:
      'A woman in her late twenties with dark curly hair wears the t-shirt with plain mid-blue jeans, standing straight-on with her arms relaxed at her sides, light grey seamless studio backdrop, large softbox key light with gentle fill, 85mm eye-level shot framed from mid-thigh up.',
    street:
      'A man in his thirties with a short beard wears the t-shirt with beige chinos and plain white sneakers, standing front-on on a quiet city pavement with his weight on one leg, golden hour side light, 50mm shot at f/2.8, shopfronts softly blurred behind.',
  },
} as const satisfies FamilyPresets;

export const SWEATSHIRT_SCENES = {
  product: {
    flatLay:
      'Lay the sweatshirt flat on a chunky cream knit throw with a mug of cocoa and a paperback with a plain cover beside it, soft overcast window light, top-down shot, natural fabric texture.',
    chair:
      'Drape the sweatshirt over a mid-century armchair in a calm living room, warm floor lamp and soft daylight mixed, eye-level 35mm shot, chest print facing the camera and smooth.',
    autumn:
      'Lay the sweatshirt flat, front up and smooth, on a wooden bench outdoors with a few fallen maple leaves around it, golden hour side light, top-down shot, print fully visible.',
    gift: 'Lay the sweatshirt flat, front up and smooth, beside an open white gift box with a ribbon, a small blank card and dried flowers on a light table, soft studio light, top-down shot, print fully visible.',
  },
  marketing: {
    ...APPAREL_MARKETING,
    outfit:
      'Lay the sweatshirt flat, front up and smooth, as the top of a styled outfit on white linen, folded corduroy trousers below it, a knitted beanie and plain boots beside it, nothing overlapping the sweatshirt, even diffused daylight, top-down shot.',
  },
  model: {
    onModel:
      'A man in his sixties with short white hair and glasses wears the sweatshirt with dark trousers, standing straight-on with his hands loosely at his sides, warm beige seamless studio backdrop, soft key light with gentle fill, 85mm eye-level shot framed from the waist up. Naturally asymmetric details: the right eye sitting fractionally lower than the left, a slightly uneven hairline at the temple.',
    cosy: 'A woman in her forties with a grey-streaked bob sits on a sofa in the sweatshirt, holding a ceramic mug in both hands in her lap below the print, a neutral throw beside her, soft side window light, 35mm eye-level medium shot, calm weekend mood. Naturally asymmetric details: one eyelid a touch heavier than the other, a subtly uneven nose bridge.',
  },
} as const satisfies FamilyPresets;

export const HOODIE_SCENES = {
  product: {
    hook: 'Hang the hoodie on a black metal wall hook in an entryway with a beanie and a skateboard leaning below, soft daylight, straight-on eye-level shot, hood relaxed, print smooth and visible.',
    flatLay:
      'Lay the hoodie flat on light grey concrete with sneakers, wireless headphones and a water bottle around it, even overcast light, top-down shot, sleeves folded naturally.',
    cabin:
      'Drape the hoodie over a wooden chair by a cabin window with snow outside, warm interior light mixed with cool daylight, eye-level 50mm shot, print facing the camera and smooth, cosy mood.',
    boutique:
      'Hang the hoodie on a clothing rail in a bright minimalist boutique with white walls and a wooden floor, soft even light, eye-level shot, background softly blurred, facing the camera, front print fully visible.',
  },
  marketing: {
    ...APPAREL_MARKETING,
    outfit:
      'Lay the hoodie flat, front up and smooth, as the top of a styled outfit on light grey concrete, folded cargo trousers below it, plain sneakers and a cap beside it, nothing overlapping the hoodie, even overcast light, top-down shot.',
  },
  model: {
    onModel:
      'A South Asian man in his twenties with short wavy hair wears the hoodie with the hood down and plain black jeans, standing straight-on with his arms relaxed at his sides, light grey seamless studio backdrop, large softbox key light with gentle fill, 85mm eye-level shot framed from mid-thigh up.',
    street:
      'A woman in her thirties with a long braid wears the hoodie with the hood down, plain joggers and white sneakers, standing front-on on a quiet park path with her weight on one leg, soft overcast light, 50mm shot at f/2.8, trees softly blurred behind.',
  },
} as const satisfies FamilyPresets;

export const POSTER_SCENES = {
  product: {
    livingRoom:
      'Show the unframed poster mounted flat on the wall with no visible fixings, on a warm white wall above a light wood sideboard with a ceramic vase and books, soft daylight from the right, straight-on eye-level shot.',
    bedroom:
      'Show the unframed poster mounted flat on a plaster wall with no visible fixings, above a bed with linen bedding and a bedside lamp, calm neutral palette, soft morning light, straight-on shot, poster parallel to the camera.',
    office:
      'Show the unframed poster mounted flat on the wall with no visible fixings, above a tidy desk with a closed laptop and a desk lamp, bright daylight, straight-on 35mm shot, poster sharp and evenly lit.',
  },
  marketing: {
    colorWall:
      'Show the unframed poster mounted flat with no visible fixings on a smooth wall painted in a soft colour picked from the artwork, a single sculptural vase on a low plinth beside it, one gentle spotlight from above, straight-on eye-level shot, calm empty wall space for a headline.',
    floating: ARTWORK_FLOATING,
  },
} as const satisfies FamilyPresets;

export const CANVAS_SCENES = {
  product: {
    livingRoom:
      'Hang the canvas above a linen sofa with textured cushions in a bright Scandinavian living room, soft diffuse daylight, straight-on eye-level shot, a soft shadow on the wall showing the canvas depth.',
    dining:
      'Hang the canvas on a pale wall above a wooden dining table with a bowl of fruit and candles, warm evening light, straight-on shot, canvas sharp and evenly lit.',
    gallery:
      'Hang the canvas on a white gallery wall under a gentle spotlight from above, clean minimal space, straight-on 50mm shot, canvas parallel to the camera.',
    shelf:
      'Rest the canvas on a floating wooden shelf with a small plant and a ceramic jar, warm white wall, soft window light, eye-level shot, slightly blurred background.',
  },
  marketing: {
    colorWall:
      'Hang the canvas on a smooth wall painted in a soft colour picked from the artwork, a single sculptural vase on a low plinth beside it, one gentle spotlight from above, straight-on eye-level shot, a soft shadow showing the canvas depth, calm empty wall space for a headline.',
    floating: ARTWORK_FLOATING,
  },
} as const satisfies FamilyPresets;

export const BLANKET_SCENES = {
  product: {
    sofa: 'Drape the blanket over the arm and seat of a cream sofa in soft folds, the main design area flat and visible, cushions beside it, warm afternoon light, eye-level 35mm shot.',
    bed: 'Spread the blanket across the foot of a neatly made bed with white linen and a tray with tea on one corner, soft morning window light, slight high angle, design fully visible.',
    picnic:
      'Lay the blanket flat on green grass in a park with a wicker basket and lemonade at one corner, dappled summer sunlight, top-down shot, design unobstructed.',
    fireside:
      'Fold the blanket loosely over a wooden armchair by a fireplace with stockings and warm string lights, cosy evening glow, eye-level shot, print area smooth.',
  },
  marketing: {
    colorBlock:
      'Spread the blanket flat, design up, across a seamless backdrop in a soft tone picked from its design, a ceramic mug and an open book with plain pages at one corner, even studio light, top-down shot, clean campaign look with empty space on one side for a headline.',
  },
} as const satisfies FamilyPresets;

export const TOTE_BAG_SCENES = {
  product: {
    market:
      "Hang the tote bag from a wooden chair back at a farmers' market stall, fresh flowers and a baguette peeking out of the top, bright natural daylight, eye-level shot, front print flat and unobstructed.",
    flatLay:
      'Lay the tote bag flat on a light wood surface with a book with a plain cover, sunglasses, keys and a water bottle around it, soft overhead daylight, top-down shot.',
    beach:
      'Stand the tote bag upright on warm sand with a rolled towel and a straw hat beside it, bright summer sun, soft shadows, eye-level shot, sea softly blurred behind.',
  },
  marketing: {
    studio:
      'Hang the tote bag by its handles from a minimal brass peg against a seamless backdrop in a soft colour picked from the print, front flat and facing the camera, even studio light with a faint shadow behind, straight-on eye-level shot, generous empty space around it.',
    colorBlock:
      'Lay the tote bag flat, front up, across a two-tone colour-block paper backdrop in shades picked from the print, its handles curved neatly above it, crisp sunny light with leaf shadows falling on the backdrop only, top-down shot, bold summer campaign look.',
  },
  model: {
    shoulder:
      'A woman in her thirties with straight black hair, in a plain white t-shirt and jeans, stands side-on on a sunny street with the tote bag on her near shoulder, its front flat and facing the camera, 35mm eye-level shot, background softly blurred.',
    holding:
      'A man in his forties with a shaved head, in a plain olive shirt, holds the tote bag by its handles in front of him at waist height, the front flat and facing the camera, a relaxed smile, bright airy room softly blurred behind, soft window light, 50mm eye-level shot.',
  },
} as const satisfies FamilyPresets;

export const STICKER_SCENES = {
  product: {
    laptop:
      'Apply the sticker to the lid of a closed matte grey laptop on a wooden desk, flat and smooth with a thin white border, soft daylight, slight high angle, sticker sharp.',
    flatLay:
      'Show the kiss-cut sticker on its backing sheet lying on a pastel paper surface beside a notebook and pens, soft even light, top-down shot, a slight shadow under its edge.',
    journal:
      'Place the sticker on the cover of a plain kraft notebook on a café table next to a latte, warm natural light, slight high angle, shallow depth of field.',
  },
  marketing: {
    floating:
      'Show the kiss-cut sticker on its backing sheet floating front-on above a seamless pastel backdrop in a tone picked from the design, a soft shadow on the backdrop behind it, even studio light, straight-on shot, playful clean campaign look.',
    colorBlock:
      'Lay the kiss-cut sticker on its backing sheet on a two-tone colour-block paper backdrop in shades picked from the design, crisp sunny light with a small shadow under its edge, top-down shot, bold campaign look with empty space on one side for a headline.',
  },
} as const satisfies FamilyPresets;
