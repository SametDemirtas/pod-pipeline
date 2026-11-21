/** The engine stopped before it wrote the larger image. */
export class UpscaleFailedError extends Error {
  constructor(readonly reason: string) {
    super(`Upscaling failed: ${reason}`);
    this.name = new.target.name;
  }
}

/** The work was stopped on purpose, e.g. because the app is closing. */
export class UpscaleStoppedError extends Error {
  constructor() {
    super('Upscaling was stopped');
    this.name = new.target.name;
  }
}
