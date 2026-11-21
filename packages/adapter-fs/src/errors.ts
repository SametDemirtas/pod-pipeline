/** The image is a PNG this scaler does not read, e.g. one with a palette or 16 bits per channel. */
export class UnsupportedPngError extends Error {
  constructor(reason: string) {
    super(`Unsupported PNG: ${reason}`);
    this.name = new.target.name;
  }
}

/** Work on an image stopped on purpose, e.g. because the app is closing. */
export class PngWorkStoppedError extends Error {
  constructor() {
    super('The image work was stopped');
    this.name = new.target.name;
  }
}

/** Work on an image failed in the worker; the message is the worker's. */
export class PngWorkFailedError extends Error {
  constructor(message: string) {
    super(`The image work failed: ${message}`);
    this.name = new.target.name;
  }
}
