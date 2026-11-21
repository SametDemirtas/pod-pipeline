import { type CatalogApi, type DesignIdRequest, type RotateDesignDto } from '@pod/contracts';
import { listedAreas, listedTargets } from '@pod/rules';
import { keptOrientationOf, type GetDesign, type RotateDesign } from '@pod/core';
import { RotateInProgressError } from '../errors/print-errors.js';
import { stoppedOr } from '../errors/work-stopped.js';
import { KeyedExclusiveRunner } from '../../shared/exclusive-runner.js';
import type { CatalogEvents } from '../catalog/catalog-service.js';
import { toDesignDetailDto } from '../dto/design-dtos.js';
import { listedPrint } from '../listing/listed-print.js';
import type { SettingsStore } from '../settings/settings-store.js';

export interface RotationServiceDeps {
  readonly rotate: Pick<RotateDesign, 'execute'>;
  readonly getDesign: Pick<GetDesign, 'execute'>;
  /** Checks the print, to find the areas of the sizes the listing sells. */
  readonly catalog: Pick<CatalogApi, 'checkPrint'>;
  readonly settings: Pick<SettingsStore, 'get'>;
  readonly events: Pick<CatalogEvents, 'catalogChanged'>;
}

/**
 * Turns artwork a quarter when its orientation is the other one than the
 * print areas of the sizes its listing sells, for the window and for
 * preparing listings alike; one turn per design at a time.
 */
export class RotationService {
  private readonly runner = new KeyedExclusiveRunner(() => new RotateInProgressError());
  private readonly closing = new AbortController();

  constructor(private readonly deps: RotationServiceDeps) {}

  /** `signal` stops the turning, as the app closing does. */
  rotateDesign(request: DesignIdRequest, signal?: AbortSignal): Promise<RotateDesignDto> {
    return this.runner.run(request.id, async () => {
      const { design } = await this.deps.getDesign.execute(request.id);
      const result = await this.deps.rotate
        .execute({
          designId: request.id,
          listedAreas: async () => {
            const listed = await listedPrint(this.deps.catalog, this.deps.settings, design);
            return { printAreas: listedAreas(listed), printTargets: listedTargets(listed) };
          },
          signal: signal ? AbortSignal.any([signal, this.closing.signal]) : this.closing.signal,
        })
        .catch((error: unknown) => {
          throw stoppedOr(error, this.closing.signal, signal);
        });
      // Advice to leave the artwork as it is changes the design only the first time.
      const advised = result.status === 'kept' && !keptOrientationOf(design);
      if (result.status === 'rotated' || advised) this.deps.events.catalogChanged();
      return {
        status: result.status,
        reason: result.status === 'unneeded' ? null : result.reason,
        design: toDesignDetailDto(await this.deps.getDesign.execute(request.id)),
      };
    });
  }

  /** Stops turning and resolves once the artwork being turned is put aside. */
  close(): Promise<void> {
    this.closing.abort();
    return this.runner.close();
  }
}
