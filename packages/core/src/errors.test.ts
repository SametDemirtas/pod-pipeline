import { describe, expect, it } from 'vitest';
import {
  ConflictError,
  DomainError,
  ImportSourceUnreadableError,
  isDomainError,
  NotFoundError,
  ValidationError,
} from './errors.js';

describe('domain errors', () => {
  it('carry a stable code, details and their own name', () => {
    const error = new NotFoundError('Design', 'd-1');

    expect(error).toBeInstanceOf(DomainError);
    expect(error.name).toBe('NotFoundError');
    expect(error.code).toBe('NOT_FOUND');
    expect(error.details).toEqual({ entity: 'Design', id: 'd-1' });
  });

  it('describe conflicts', () => {
    const error = new ConflictError('taken', { key: '01' });

    expect(error.code).toBe('CONFLICT');
    expect(error.details).toEqual({ key: '01' });
  });

  it('keep the cause of an unreadable import folder', () => {
    const cause = new Error('EACCES');
    const error = new ImportSourceUnreadableError('/x', cause);

    expect(error.details).toEqual({ rootPath: '/x', cause: 'EACCES' });
    expect(error.cause).toBe(cause);
    expect(new ImportSourceUnreadableError('/x', 'gone').details['cause']).toBe('gone');
  });

  it('are recognised by isDomainError', () => {
    expect(isDomainError(new ValidationError('limit', 'bad'))).toBe(true);
    expect(isDomainError(new Error('plain'))).toBe(false);
    expect(isDomainError('text')).toBe(false);
  });
});
