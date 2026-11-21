import type { ImportPreviewDto, ImportResultDto } from '@pod/contracts/client';

/** Steps of the import wizard; each holds exactly the data that step needs. */
export type ImportState =
  | { readonly step: 'choose' }
  | { readonly step: 'checking'; readonly rootPath: string }
  | { readonly step: 'review'; readonly preview: ImportPreviewDto }
  | { readonly step: 'importing'; readonly preview: ImportPreviewDto }
  | { readonly step: 'done'; readonly result: ImportResultDto }
  | { readonly step: 'failed'; readonly error: unknown; readonly rootPath: string | null };

type ImportEvent =
  | { readonly type: 'check'; readonly rootPath: string }
  | { readonly type: 'checked'; readonly preview: ImportPreviewDto }
  | { readonly type: 'import' }
  | { readonly type: 'imported'; readonly result: ImportResultDto }
  | { readonly type: 'failed'; readonly error: unknown }
  | { readonly type: 'reset' };

export const INITIAL_IMPORT_STATE: ImportState = { step: 'choose' };

/** Pure transition function; events that make no sense in a step are ignored. */
export function importReducer(state: ImportState, event: ImportEvent): ImportState {
  switch (event.type) {
    case 'check':
      return { step: 'checking', rootPath: event.rootPath };
    case 'checked':
      return state.step === 'checking' ? { step: 'review', preview: event.preview } : state;
    case 'import':
      return state.step === 'review' && hasWork(state.preview)
        ? { step: 'importing', preview: state.preview }
        : state;
    case 'imported':
      return state.step === 'importing' ? { step: 'done', result: event.result } : state;
    case 'failed':
      return { step: 'failed', error: event.error, rootPath: rootPathOf(state) };
    case 'reset':
      return INITIAL_IMPORT_STATE;
  }
}

/** Whether confirming the preview would change anything. */
export function hasWork(preview: ImportPreviewDto): boolean {
  return preview.counts.new + preview.counts.changed + preview.conceptRenames.length > 0;
}

function rootPathOf(state: ImportState): string | null {
  switch (state.step) {
    case 'checking':
      return state.rootPath;
    case 'review':
    case 'importing':
      return state.preview.rootPath;
    case 'failed':
      return state.rootPath;
    default:
      return null;
  }
}
