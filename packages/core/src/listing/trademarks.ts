import { foldLetters } from '../catalog/text-folding.js';
import type { ListingText } from './listing-text.js';

/**
 * Names that marketplaces remove listings for when they appear in a title or
 * tags. Only names that are rarely an ordinary word are listed, so a match is
 * worth the seller's attention. Spaces stand for any run of spaces or
 * punctuation, or for none, so `Spider Man` also finds `Spider-Man` and
 * `Spiderman`. Names are listed in the singular; the plural is found too.
 */
const TRADEMARKS: readonly string[] = [
  // Brands
  'Adidas',
  'Barbie',
  'Chanel',
  'Coca Cola',
  'Coke',
  'Gucci',
  'Harley Davidson',
  'Hot Wheels',
  'Lego',
  'Louis Vuitton',
  'Nike',
  'Pepsi',
  'Prada',
  'Starbucks',
  // Blank makers and print providers
  'Bella Canvas',
  'Comfort Colors',
  'Fruit of the Loom',
  'Gildan',
  'Hanes',
  'Next Level Apparel',
  'Printful',
  'Printify',
  // Studios, franchises and characters
  'Avenger',
  'Baby Yoda',
  'Batman',
  'Bluey',
  'Care Bear',
  'Darth Vader',
  'DC Comics',
  'Disney',
  'Disneyland',
  'Seuss',
  'Fortnite',
  'Game of Thrones',
  'Grinch',
  'Gryffindor',
  'Harry Potter',
  'Hello Kitty',
  'Hogwarts',
  'Kuromi',
  'Labubu',
  'Lilo and Stitch',
  'Looney Tune',
  'Lord of the Rings',
  'Mandalorian',
  'Marvel Comics',
  'Mickey Mouse',
  'Minecraft',
  'Minnie Mouse',
  'My Little Pony',
  'Nintendo',
  'Paw Patrol',
  'Peppa Pig',
  'Pikachu',
  'Pixar',
  'Pokemon',
  'Rick and Morty',
  'Roblox',
  'Sanrio',
  'Scooby Doo',
  'Sesame Street',
  'Simpsons',
  'Slytherin',
  'Snoopy',
  'Sonic the Hedgehog',
  'Spider Man',
  'Sponge Bob',
  'Squishmallow',
  'Star Trek',
  'Star Wars',
  'Stranger Things',
  'Studio Ghibli',
  'Super Mario',
  'Superman',
  'Totoro',
  'Wednesday Addams',
  'Winnie the Pooh',
  'Wonder Woman',
  'Zelda',
  // Celebrities
  'Beyonce',
  'Elvis Presley',
  'Eras Tour',
  'Harry Styles',
  'Marilyn Monroe',
  'Swiftie',
  'Taylor Swift',
  // Sports leagues and events
  'FIFA',
  'MLB',
  'MLS',
  'NBA',
  'NCAA',
  'NFL',
  'NHL',
  'Olympic Games',
  'Super Bowl',
  'UEFA',
];

/** Lower case words without accents, each surrounded by one space. */
function words(text: string): string {
  const plain = foldLetters(text)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
  return ` ${plain} `;
}

/** Each name as words and run together, each also with a plural `s`. */
const SEARCHED = TRADEMARKS.map((name) => {
  const spaced = words(name);
  const joined = ` ${spaced.replace(/ /g, '')} `;
  return {
    name,
    forms: [...new Set([spaced, joined])].flatMap((form) => [form, `${form.trimEnd()}s `]),
  };
});

/**
 * The listed trademarks that `text` names as whole words, ignoring case and
 * accents, in the order they are listed.
 */
export function findTrademarks(text: string): string[] {
  const searched = words(text);
  return SEARCHED.filter(({ forms }) => forms.some((form) => searched.includes(form))).map(
    ({ name }) => name,
  );
}

/**
 * Trademarks a listing's title or tags name. The description may name a
 * blank's maker as a fact, so it is not searched.
 */
export function findListingTrademarks(text: Pick<ListingText, 'title' | 'tags'>): string[] {
  return [...new Set([text.title, ...text.tags].flatMap(findTrademarks))];
}
