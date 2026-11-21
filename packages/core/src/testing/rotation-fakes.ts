import type { QuarterTurn } from '../catalog/model.js';
import type { ImageRotator } from '../ports/image-rotator.js';
import type {
  RotationAdvice,
  RotationAdvisor,
  RotationQuestion,
} from '../ports/rotation-advisor.js';
import type { StopSignal, WrittenPng } from '../ports/work.js';
import type { FakeSourceFolder } from './fakes.js';

/** Records what it was asked for and writes the image turned, its sides swapped, into the folder. */
export class FakeImageRotator implements ImageRotator {
  readonly requests: { source: string; turn: QuarterTurn; signal?: StopSignal | undefined }[] = [];
  /** How large the written files are. */
  byteSize = 30_000_000;

  constructor(private readonly folder: FakeSourceFolder) {}

  async rotate(source: string, turn: QuarterTurn, signal?: StopSignal): Promise<WrittenPng> {
    this.requests.push({ source, turn, signal });
    const image = await this.folder.inspect(source);
    const size = { width: image?.height ?? 1, height: image?.width ?? 1 };
    const relativePath = `turned/${String(this.requests.length)}.png`;
    this.folder.write({
      relativePath,
      content: `${this.folder.contentAt(source)} turned ${String(turn)}`,
      image: { mimeType: 'image/png', ...size },
    });
    return {
      ...size,
      byteSize: this.byteSize,
      absolutePath: this.folder.absolutePath(relativePath),
      dispose: () => {
        this.folder.remove(relativePath);
        return Promise.resolve();
      },
    };
  }
}

/** Gives the advice it is set to and records each question. */
export class FakeRotationAdvisor implements RotationAdvisor {
  readonly questions: RotationQuestion[] = [];
  advice: RotationAdvice = {
    degrees: 90,
    reason: 'The figure stands upright on the hung blanket.',
  };

  advise(question: RotationQuestion): Promise<RotationAdvice> {
    this.questions.push(question);
    return Promise.resolve(this.advice);
  }
}
