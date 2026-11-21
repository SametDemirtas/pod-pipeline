/** Runs `release` at most once successfully; a failed attempt may be retried. */
export function releaseOnce(release: () => Promise<void>): () => Promise<void> {
  let pending: Promise<void> | undefined;
  return () => {
    pending ??= release().catch((error: unknown) => {
      pending = undefined;
      throw error;
    });
    return pending;
  };
}
