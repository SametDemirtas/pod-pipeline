import { session } from 'electron';

const CLIPBOARD_WRITE = 'clipboard-sanitized-write';

/** The app's own window may only write to the clipboard, for its Copy buttons. */
export function lockDownDefaultSession(): void {
  session.defaultSession.setPermissionRequestHandler((_contents, permission, decide) => {
    decide(permission === CLIPBOARD_WRITE);
  });
  session.defaultSession.setPermissionCheckHandler(
    (_contents, permission) => permission === CLIPBOARD_WRITE,
  );
}
