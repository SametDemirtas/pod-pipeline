import { AppError } from '../../shared/app-error.js';
import { InProgressError } from './in-progress.js';

export class SceneInProgressError extends InProgressError {
  constructor() {
    super('SCENE_IN_PROGRESS', 'The previous scene is still being generated');
  }
}

/** A reference photo for a scene's style is not a PNG or JPEG image the language model can read. */
export class ReferenceImageUnreadableError extends AppError {
  constructor(reason: 'tooLarge' | 'notAnImage') {
    super('REFERENCE_IMAGE_UNREADABLE', `The reference image cannot be used: ${reason}`, {
      reason,
    });
  }
}
