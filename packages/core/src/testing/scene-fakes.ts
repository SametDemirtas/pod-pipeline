import type { TemporaryFile } from '../ports/downloads.js';
import type { PreviewImage } from '../ports/previews.js';
import type { ProductDetails, ProductReader } from '../ports/product-reader.js';
import type { SceneGenerator, SceneRequest } from '../ports/scene-generator.js';
import type { SceneInspector } from '../ports/scene-inspector.js';
import type { SceneStyleReader, StyleReading } from '../ports/scene-style-reader.js';
import type { SceneCheck } from '../mockups/mockup.js';
import type { FakeSourceFolder } from './fakes.js';

/** Writes one scene file per request, named after the prompt's first word and its number. */
export class FakeSceneGenerator implements SceneGenerator {
  readonly requests: SceneRequest[] = [];
  failWith: Error | undefined;
  /** Makes the generated file something other than an image. */
  notAnImage = false;

  constructor(private readonly folder: FakeSourceFolder) {}

  generate(request: SceneRequest): Promise<TemporaryFile> {
    this.requests.push(request);
    if (this.failWith) return Promise.reject(this.failWith);
    const word = request.prompt.split(' ')[0] ?? 'scene';
    const relativePath = `scenes/${word}-${this.requests.length}.png`;
    this.folder.write({
      relativePath,
      content: request.prompt,
      ...(this.notAnImage ? { image: null } : {}),
    });
    return Promise.resolve({
      absolutePath: this.folder.absolutePath(relativePath),
      dispose: () => {
        this.folder.remove(relativePath);
        return Promise.resolve();
      },
    });
  }
}

/** Answers every comparison with `answer`, or fails with `failWith`. */
export class FakeSceneInspector implements SceneInspector {
  readonly compared: (readonly [PreviewImage, PreviewImage])[] = [];
  answer: SceneCheck = { same: true, issues: [], unverifiable: [] };
  failWith: Error | undefined;
  /** Holds every answer until this resolves, to let a test act while a check runs. */
  hold: Promise<void> = Promise.resolve();

  async compare(original: PreviewImage, scene: PreviewImage): Promise<SceneCheck> {
    this.compared.push([original, scene]);
    await this.hold;
    if (this.failWith) throw this.failWith;
    return this.answer;
  }
}

/** Gives the queued answers in turn and repeats the last one. */
export class FakeStyleReader implements SceneStyleReader {
  readonly requests: {
    readonly reference: PreviewImage;
    readonly productType: string;
    readonly avoid: readonly string[];
  }[] = [];
  answers: StyleReading[] = [
    { description: 'Place the mug on a wooden table.', visibleWords: [], look: {} },
  ];

  read(reference: PreviewImage, productType: string, avoid: readonly string[]) {
    this.requests.push({ reference, productType, avoid });
    const answer = this.answers.length > 1 ? this.answers.shift() : this.answers[0];
    return answer ? Promise.resolve(answer) : Promise.reject(new Error('no answer queued'));
  }
}

/** What the fake reader sees in every photo: a white mug with a lettered print. */
export const SAMPLE_PRODUCT_DETAILS: ProductDetails = {
  product: 'white ceramic mug',
  material: 'glossy glazed ceramic',
  printPlacement: 'centred on the side facing the camera',
  printHasLettering: true,
  printColors: ['navy', 'coral'],
  notMistakenFor: 'a travel mug with a lid',
};

/** Answers every photo with `answer`, or fails with `failWith`. */
export class FakeProductReader implements ProductReader {
  readonly requests: { readonly photo: PreviewImage; readonly productType: string }[] = [];
  answer = SAMPLE_PRODUCT_DETAILS;
  failWith: Error | undefined;

  read(photo: PreviewImage, productType: string): Promise<ProductDetails> {
    this.requests.push({ photo, productType });
    return this.failWith ? Promise.reject(this.failWith) : Promise.resolve(this.answer);
  }
}
