import { describe, expect, it } from 'vitest';
import { findAiTells } from './find-ai-tells.js';

type Listing = readonly [title: string, description: string, tags?: readonly string[]];

/**
 * Listings as small shops write them, in each shop language, with the words
 * people use in real listings that AI text also likes. None may count as a tell.
 */
const HUMAN_COPY: Readonly<Record<string, readonly Listing[]>> = {
  en: [
    [
      'Tulip Mug with Pumpkin, Cute Halloween Coffee Cup',
      'Cosy tulip mug with three little tulips and a pumpkin, printed on a glossy white 11 oz mug. ' +
        'The tulips are drawn in soft grey lines, cute enough for a desk at work.\n\n' +
        'Details\n- 11 oz (325 ml) ceramic\n- Dishwasher and microwave safe\n- Made to order',
    ],
    [
      'Sunflower T-Shirt, Retro Floral Graphic Tee for Gardeners',
      'A soft cotton tee with a big yellow sunflower on the front. A perfect gift for gardeners. ' +
        'Available in S – 3XL.\n\nPLEASE NOTE: colours may vary slightly from screen to screen.',
    ],
    [
      'Lighthouse Poster, Coastal Wall Art Print',
      'A lighthouse at dusk, printed on matte paper. The hand-drawn lines look great in a ' +
        'hallway or a beach house.\n\nDetails\n- 18 x 24 in (45 x 61 cm)\n- Frame not included',
    ],
    [
      'Cat Lover Tote Bag, Funny Cat Mom Gift',
      'For cat people: this canvas tote has a sleepy orange cat and the words "Do not disturb". ' +
        'Big enough for groceries or a laptop. Colour #FFCC00 on natural canvas.',
    ],
  ],
  de: [
    [
      'Geistertasse mit Kürbis, lustige Halloween Kaffeetasse',
      'Gemütliche Geistertasse mit drei kleinen Geistern und einem Kürbis, auf einer weißen ' +
        'Keramiktasse mit 325 ml. Die Geister sind in weichen grauen Linien gezeichnet – süß ' +
        'für den Schreibtisch.\n\nDetails\n- Keramik, 325 ml\n- Spülmaschinenfest\n- Wird auf Bestellung gedruckt',
    ],
    [
      'Sonnenblumen T-Shirt, Retro Garten Shirt',
      'Ein weiches Shirt mit einer großen Sonnenblume. Egal ob im Garten oder in der Stadt, das ' +
        'perfekte Geschenk für Gartenfans.',
    ],
    ['Sonnenblumen Shirt', 'Das Motiv unterstreicht den Retro-Look des Shirts.'],
    [
      'Lehrer Tasse Abschied, Zeugnis Tasse Schulende',
      'Eine Tasse für Lehrer zum Schuljahresende. Ein Zeugnis voller Einsen ziert die Vorderseite, ' +
        'ein echter Hingucker im Lehrerzimmer.',
    ],
  ],
  fr: [
    [
      'Mug fantôme citrouille, tasse Halloween',
      'Mug fantôme avec trois petits fantômes et une citrouille, imprimé sur un mug blanc de 325 ml. ' +
        'Le dessin est doux et drôle, pour un bureau ou une cuisine.\n\nDétails\n- Céramique\n- Imprimé à la commande',
    ],
    [
      'T-shirt tournesol rétro, tee-shirt jardin',
      'Un t-shirt en coton avec un tournesol dessiné à la main. Impression par sublimation, du S au XL.',
    ],
    ['Tee-shirt jardin', 'Parfait pour les amoureux du jardin, en coton doux.'],
  ],
  pt: [
    [
      'Caneca de fantasma, caneca de Halloween',
      'Caneca de fantasma com três fantasminhas e uma abóbora, impressa numa caneca branca de ' +
        '325 ml, em cores vibrantes.\n\nDetalhes\n- Cerâmica\n- Feita sob encomenda',
    ],
    [
      'Camiseta girassol, camiseta floral retrô',
      'Uma camiseta de algodão com um girassol desenhado à mão. Tecido macio ao toque.',
    ],
    ['Camiseta jardim', 'Um presente perfeito para quem gosta de jardim.'],
  ],
  es: [
    ['Taza de fantasma', 'Taza con tres fantasmitas, estampada en una taza blanca de 325 ml.'],
    [
      'Taza gato dormido, taza de cerámica 330 ml',
      'Taza de cerámica blanca de 330 ml con un gato dormido dibujado a mano. Es el regalo ' +
        'perfecto para tu hermana si le gustan los gatos. Apta para lavavajillas y microondas.',
      ['taza gato', 'regalo gatos', 'taza cerámica'],
    ],
    [
      'Lámina botánica A4, monstera',
      'Lámina A4 impresa en papel mate de 250 g con hojas de monstera en verde. Colores ' +
        'vibrantes que no destiñen con el sol. Se envía sin marco, en un sobre rígido.',
      ['lámina botánica', 'decoración pared', 'monstera'],
    ],
  ],
  it: [
    ['Tazza fantasma', 'Tazza con tre piccoli fantasmi, stampata su una tazza bianca da 325 ml.'],
    [
      'Tazza gatto rosso, tazza in ceramica 330 ml',
      'Tazza in ceramica bianca da 330 ml con un gatto rosso che dorme su una pila di libri. ' +
        'Pensata per chi ama i gatti e le letture lente. Va in lavastoviglie.',
      ['tazza gatto', 'regalo gattara', 'tazza ceramica'],
    ],
    [
      'Felpa Dolomiti grigia',
      'Felpa con cappuccio grigia in cotone felpato, con le Dolomiti stampate sul petto. ' +
        'Un tocco di montagna anche in città. Taglie dalla S alla XXL.',
      ['felpa montagna', 'dolomiti', 'felpa unisex'],
    ],
  ],
  nl: [
    ['Spook mok', 'Mok met drie kleine spookjes en een pompoen, bedrukt op een witte mok.'],
    [
      'Mok slapende kat, keramiek 330 ml',
      'Witte mok van 330 ml met een slapende kat, met de hand getekend. Kortom: een fijne mok ' +
        'voor wie van katten houdt. Kan in de vaatwasser.',
      ['kattenmok', 'cadeau kattenliefhebber', 'mok keramiek'],
    ],
    [
      'Poster Amsterdam grachten A3',
      'Poster op A3 van de grachten in Amsterdam bij avondlicht, gedrukt op mat papier van ' +
        '200 gram. Een ode aan de stad waar ik woon. Wordt opgerold verstuurd.',
      ['poster amsterdam', 'wanddecoratie', 'grachten'],
    ],
  ],
  ru: [['Кружка с привидениями', 'Кружка с тремя маленькими привидениями — для чая и кофе.']],
  pl: [['Kubek z duszkami', 'Kubek z trzema duszkami – na kawę i herbatę.']],
  ja: [['おばけマグカップ', '三匹のおばけとかぼちゃのマグカップです。']],
};

/** The tags most listings here carry; the local ones bring their own. */
const TAGS = ['gift idea', 'perfect gift'];

describe('human listings', () => {
  it.each(
    Object.entries(HUMAN_COPY).flatMap(([language, listings]) =>
      listings.map(
        ([title, description, tags = TAGS]) => [language, title, description, tags] as const,
      ),
    ),
  )('%s: %s reads as written by a person', (language, title, description, tags) => {
    expect(findAiTells({ title, description, tags }, language)).toEqual([]);
  });
});
