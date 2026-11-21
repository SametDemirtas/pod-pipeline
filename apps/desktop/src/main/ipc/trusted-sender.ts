/**
 * True when an IPC event comes from `frame` itself. A request from a
 * subframe, another window or an unknown sender is never trusted.
 */
export function isFromFrame(event: unknown, frame: unknown): boolean {
  if (typeof event !== 'object' || event === null || !('senderFrame' in event)) return false;
  const sender = event.senderFrame;
  return sender !== null && sender !== undefined && sender === frame;
}
