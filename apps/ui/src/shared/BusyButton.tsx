import { Button, IconButton } from '@radix-ui/themes';
import type { ComponentProps, MouseEvent } from 'react';

interface Busy {
  /** Its work is running, or cannot start now; clicks do nothing meanwhile. */
  readonly busy: boolean;
}

type BusyButtonProps = ComponentProps<typeof Button> & Busy;
type BusyIconButtonProps = ComponentProps<typeof IconButton> & Busy;

/** Ignores clicks while busy; also keeps a form from submitting and a dialog trigger from opening. */
function busyClick<E extends MouseEvent>(busy: boolean, onClick?: (event: E) => void) {
  return (event: E) => {
    if (busy) event.preventDefault();
    else onClick?.(event);
  };
}

/**
 * A button that keeps keyboard focus while it cannot act, telling assistive
 * technology with `aria-disabled`. Radix disables a loading button unless
 * `disabled` is given, which would drop focus to the page, so it is given.
 */
export function BusyButton({ busy, disabled = false, onClick, ...props }: BusyButtonProps) {
  return (
    <Button
      {...props}
      disabled={disabled}
      aria-disabled={busy}
      onClick={busyClick(busy, onClick)}
    />
  );
}

/** {@link BusyButton} with an icon in place of a label. */
export function BusyIconButton({ busy, disabled = false, onClick, ...props }: BusyIconButtonProps) {
  return (
    <IconButton
      {...props}
      disabled={disabled}
      aria-disabled={busy}
      onClick={busyClick(busy, onClick)}
    />
  );
}
