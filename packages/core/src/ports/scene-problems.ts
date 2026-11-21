/** Where failures go that scenes are made without, for someone to look into. */
export interface SceneProblems {
  /** A step that may ask an outside service failed; the scenes went on without it. */
  stepFailed(error: unknown): void;
  /** Removing the worse of two candidates failed, so both stay. */
  removalFailed(error: unknown): void;
}
