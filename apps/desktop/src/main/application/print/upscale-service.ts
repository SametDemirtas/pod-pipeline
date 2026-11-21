import {
  type CatalogApi,
  type DesignDetailDto,
  type DesignIdRequest,
  type UpscaleProgressDto,
} from '@pod/contracts';
import { listedTargets } from '@pod/rules';
import type { GetDesign, UpscaleDesign } from '@pod/core';
import { UpscaleInProgressError, UpscalerUnavailableError } from '../errors/print-errors.js';
import { stoppedOr } from '../errors/work-stopped.js';
import type { CatalogEvents } from '../catalog/catalog-service.js';
import { toDesignDetailDto } from '../dto/design-dtos.js';
import { listedPrint } from '../listing/listed-print.js';
import { ExclusiveRunner } from '../../shared/exclusive-runner.js';
import type { SettingsStore } from '../settings/settings-store.js';

export interface UpscaleEvents {
  readonly upscaleProgress: (progress: UpscaleProgressDto) => void;
}

export interface UpscaleServiceDeps {
  /** `null` when the engine is not installed next to the app. */
  readonly upscale: Pick<UpscaleDesign, 'execute'> | null;
  readonly getDesign: Pick<GetDesign, 'execute'>;
  /** Checks the print, to find the areas of the sizes the listing sells. */
  readonly catalog: Pick<CatalogApi, 'checkPrint'>;
  readonly settings: Pick<SettingsStore, 'get'>;
  readonly events: Pick<CatalogEvents, 'catalogChanged'> & UpscaleEvents;
}

/**
 * Makes artwork larger on this computer with the model the settings choose,
 * as large as the sizes its listing sells need.
 * One artwork at a time, for the window and for preparing listings alike, as
 * the work fills the graphics card.
 */
export class UpscaleService {
  private readonly runner = new ExclusiveRunner(() => new UpscaleInProgressError());
  private readonly closing = new AbortController();

  constructor(private readonly deps: UpscaleServiceDeps) {}

  /**
   * `signal` stops the engine, as the app closing does; stopped work fails
   * with `WorkStoppedError`, or `AppClosingError` when the app is closing.
   */
  upscaleDesign(request: DesignIdRequest, signal?: AbortSignal): Promise<DesignDetailDto> {
    return this.runner.run(async () => {
      const { upscale } = this.deps;
      if (!upscale) throw new UpscalerUnavailableError();
      const { design } = await this.deps.getDesign.execute(request.id);
      const [{ upscaleModel }, listed] = await Promise.all([
        this.deps.settings.get(),
        listedPrint(this.deps.catalog, this.deps.settings, design),
      ]);
      let reported = -1;
      await upscale
        .execute({
          designId: request.id,
          model: upscaleModel,
          printTargets: listedTargets(listed),
          fit: listed.check.fit,
          signal: signal ? AbortSignal.any([signal, this.closing.signal]) : this.closing.signal,
          // The engine reports every tile; the window hears of each whole percent.
          onProgress: (share) => {
            const percent = Math.floor(share * 100);
            if (percent === reported) return;
            reported = percent;
            this.deps.events.upscaleProgress({ designId: request.id, share: percent / 100 });
          },
        })
        .catch((error: unknown) => {
          throw stoppedOr(error, this.closing.signal, signal);
        });
      this.deps.events.catalogChanged();
      return toDesignDetailDto(await this.deps.getDesign.execute(request.id));
    });
  }

  /** Stops the engine and resolves once the artwork it was making is put aside. */
  close(): Promise<void> {
    this.closing.abort();
    return this.runner.close();
  }
}
