/** Loads once and keeps the value; a failed load is tried again on the next call. */
export function remembered<T>(load: () => Promise<T>): () => Promise<T> {
  let value: Promise<T> | undefined;
  return () => {
    value ??= load().catch((error: unknown) => {
      value = undefined;
      throw error;
    });
    return value;
  };
}
