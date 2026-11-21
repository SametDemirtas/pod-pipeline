import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ConflictError, ImportPlanChangedError, NotFoundError } from '@pod/core';
import {
  ImportFolderNotApprovedError,
  ImportInProgressError,
} from '../application/errors/catalog-errors.js';
import { ProviderFailedError } from '../application/errors/provider-errors.js';
import { AppError } from '../shared/app-error.js';
import { toApiError } from './to-api-error.js';

describe('toApiError', () => {
  it('keeps domain error codes and details', () => {
    const log = vi.fn();

    expect(toApiError(new NotFoundError('Design', 'x'), log)).toEqual({
      code: 'NOT_FOUND',
      message: 'Design x was not found',
      details: { entity: 'Design', id: 'x' },
    });
    expect(toApiError(new ImportPlanChangedError(), log).code).toBe('IMPORT_PLAN_CHANGED');
    expect(toApiError(new ConflictError('taken'), log).code).toBe('CONFLICT');
    expect(toApiError(new ImportInProgressError(), log).code).toBe('IMPORT_IN_PROGRESS');
    expect(toApiError(new ImportFolderNotApprovedError('/x'), log)).toEqual({
      code: 'IMPORT_FOLDER_NOT_APPROVED',
      message: 'Import is only allowed from folders chosen in the app',
      details: { rootPath: '/x' },
    });
    expect(log).not.toHaveBeenCalled();
  });

  it('hides secrets in the message and details of any error it passes on', () => {
    const payload = toApiError(
      new ProviderFailedError('Printful', 'token sk-proj-AbC123_def456-GhI789 refused'),
      vi.fn(),
    );

    expect(payload).toMatchObject({
      message: 'Printful failed: token [hidden] refused',
      details: { service: 'Printful', reason: 'token [hidden] refused' },
    });
    expect(toApiError(new ConflictError('Bearer pf-secret-123 was refused'), vi.fn()).message).toBe(
      'Bearer [hidden] was refused',
    );
  });

  it('hides secrets in details nested in objects and lists', () => {
    const payload = toApiError(
      new AppError('PROVIDER_FAILED', 'failed', {
        response: { header: 'Bearer pf-secret-123', steps: [{ note: 'Bearer pf-secret-456' }] },
        attempts: 2,
      }),
      vi.fn(),
    );

    expect(payload.details).toEqual({
      response: { header: 'Bearer [hidden]', steps: [{ note: 'Bearer [hidden]' }] },
      attempts: 2,
    });
  });

  it('describes invalid input', () => {
    const parsed = z.object({ id: z.string() }).safeParse({ id: 1 });

    expect(toApiError(parsed.error, vi.fn())).toMatchObject({
      code: 'INVALID_REQUEST',
      details: { issues: [{ path: ['id'] }] },
    });
  });

  it('logs unexpected errors and hides their message', () => {
    const log = vi.fn();
    const error = new Error('SQLITE_CORRUPT at /Users/someone/catalog.db');

    expect(toApiError(error, log)).toEqual({
      code: 'INTERNAL',
      message: 'Something went wrong',
      details: {},
    });
    expect(log).toHaveBeenCalledWith(error);
  });
});
