import { Theme } from '@radix-ui/themes';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LabeledSelect } from './LabeledSelect.js';

describe('LabeledSelect', () => {
  it('names the select by its label and is off with nothing to choose', () => {
    render(
      <Theme>
        <LabeledSelect
          label="Board"
          value={undefined}
          options={[]}
          disabled={false}
          onChange={() => undefined}
        />
      </Theme>,
    );

    expect(screen.getByRole('combobox', { name: 'Board' })).toBeDisabled();
  });

  it('keeps the focus and stays shut while a change saves', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const select = (busy: boolean) => (
      <Theme>
        <LabeledSelect
          label="Language"
          value="en"
          busy={busy}
          options={[
            { value: 'en', label: 'English' },
            { value: 'de', label: 'Deutsch' },
          ]}
          onChange={onChange}
        />
      </Theme>
    );
    const { rerender } = render(select(true));
    const trigger = screen.getByRole('combobox', { name: 'Language' });

    await user.click(trigger);

    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute('aria-disabled', 'true');
    expect(screen.queryByRole('option', { name: 'Deutsch' })).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    rerender(select(false));
    expect(screen.queryByRole('option', { name: 'Deutsch' })).not.toBeInTheDocument();
  });
});
