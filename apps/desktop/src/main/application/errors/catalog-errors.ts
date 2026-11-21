import { AppError } from '../../shared/app-error.js';
import { InProgressError } from './in-progress.js';

export class ImportInProgressError extends InProgressError {
  constructor() {
    super('IMPORT_IN_PROGRESS', 'Another import operation is still running');
  }
}

export class ImportFolderNotApprovedError extends AppError {
  constructor(rootPath: string) {
    super('IMPORT_FOLDER_NOT_APPROVED', 'Import is only allowed from folders chosen in the app', {
      rootPath,
    });
  }
}
