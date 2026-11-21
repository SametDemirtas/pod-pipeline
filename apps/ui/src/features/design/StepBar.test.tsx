import { Theme } from '@radix-ui/themes';
import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';
import { DESIGN_STEPS, type DesignStep, type StepStatus } from '@pod/rules';
import { createI18n } from '../../i18n/i18n.js';
import { StepBar } from './StepBar.js';

describe('StepBar', () => {
  it('leaves out the finished steps while none is finished', async () => {
    const statuses = Object.fromEntries(DESIGN_STEPS.map((step) => [step, 'open'])) as Record<
      DesignStep,
      StepStatus
    >;
    render(
      <I18nextProvider i18n={await createI18n('en')}>
        <Theme>
          <StepBar statuses={statuses} />
        </Theme>
      </I18nextProvider>,
    );

    expect(screen.queryByRole('list', { name: 'Finished steps' })).not.toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Next steps' })).toBeInTheDocument();
  });
});
