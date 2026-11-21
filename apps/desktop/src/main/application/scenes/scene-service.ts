import type {
  CheckSceneAgainRequest,
  ConfirmScenePrintRequest,
  CreateSceneRequest,
  CreatedScenesDto,
  DescribeSceneStyleRequest,
  MockupDto,
  PreviewSceneLookRequest,
  SceneLookPreviewDto,
  SceneStyleDto,
} from '@pod/contracts';
import {
  type CompareScene,
  type ConfirmScenePrint,
  type CreateBestScenes,
  type DescribeSceneStyle,
  lookLine,
  lookOptionsFor,
  offeredLook,
  productFamilyId,
} from '@pod/core';
import { SceneInProgressError } from '../errors/scene-errors.js';
import type { CatalogEvents } from '../catalog/catalog-service.js';
import { toMockupDto } from '../dto/print-dtos.js';
import { KeyedExclusiveRunner } from '../../shared/exclusive-runner.js';
import type { ReferenceImages } from './reference-images.js';

export interface SceneServiceDeps {
  readonly createBest: Pick<CreateBestScenes, 'execute'>;
  readonly confirmPrint: Pick<ConfirmScenePrint, 'execute'>;
  readonly compare: Pick<CompareScene, 'execute'>;
  readonly describeStyle: Pick<DescribeSceneStyle, 'execute'>;
  readonly references: Pick<ReferenceImages, 'take'>;
  readonly events: Pick<CatalogEvents, 'catalogChanged'>;
}

/** Scenes, which only the window offers, as they are billed to the seller. */
export class SceneService {
  // One scene per design at a time, so a double click never pays for two.
  private readonly runner = new KeyedExclusiveRunner(() => new SceneInProgressError());

  constructor(private readonly deps: SceneServiceDeps) {}

  createScene(request: CreateSceneRequest): Promise<CreatedScenesDto> {
    return this.runner.run(request.designId, async () => {
      const created = await this.deps.createBest.execute(request);
      this.deps.events.catalogChanged();
      return {
        scenes: created.scenes.map(toMockupDto),
        candidateFailed: created.candidateFailed,
      };
    });
  }

  confirmScenePrint(request: ConfirmScenePrintRequest): Promise<MockupDto> {
    return this.runner.run(request.designId, async () => {
      const scene = await this.deps.confirmPrint.execute(request);
      this.deps.events.catalogChanged();
      return toMockupDto(scene);
    });
  }

  /** The check is billed, so a double click or a scene under way must not start a second one. */
  checkSceneAgain(request: CheckSceneAgainRequest): Promise<MockupDto> {
    return this.runner.run(request.designId, async () => {
      const scene = await this.deps.compare.execute(request);
      this.deps.events.catalogChanged();
      return toMockupDto(scene);
    });
  }

  /** Reading the reference is billed, so it is refused while other scene work of the design runs. */
  describeSceneStyle(request: DescribeSceneStyleRequest): Promise<SceneStyleDto | null> {
    return this.runner.run(request.designId, async () => {
      const reference = await this.deps.references.take(request.image);
      if (reference === null) return null;
      return this.deps.describeStyle.execute({ designId: request.designId, reference });
    });
  }

  /** Costs nothing: the line is written here, without asking any service. */
  previewSceneLook(request: PreviewSceneLookRequest): Promise<SceneLookPreviewDto> {
    const familyId = productFamilyId(request.familyId);
    return Promise.resolve({
      line: lookLine(offeredLook(familyId, request.look)),
      options: lookOptionsFor(familyId, request.look),
    });
  }

  /** Refuses new scene work and resolves once billed scenes under way are stored. */
  close(): Promise<void> {
    return this.runner.close();
  }
}
