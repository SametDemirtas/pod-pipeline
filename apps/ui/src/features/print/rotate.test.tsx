import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createFakeApi, printCheckDto } from '../../testing/fake-api.js';
import { renderApp } from '../../testing/render-app.js';
import { mug } from '../../testing/print.js';

describe('turning artwork to fit the print area', () => {
  it('offers to turn artwork of the other orientation, then says how far and why', async () => {
    const { api } = createFakeApi([mug()]);
    api.checkPrint.mockResolvedValue(printCheckDto({ turnsToFit: true }));
    const { user } = await renderApp(api, '/designs/id-01-mug');

    await user.click(await screen.findByRole('button', { name: 'Turn to fit' }));

    expect(api.rotateDesign).toHaveBeenCalledWith({ id: 'id-01-mug' });
    expect(await screen.findByText('Rotated 90° to fit the print area.')).toBeInTheDocument();
    expect(screen.getByText('Why: The figure needs to stand upright.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Turn to fit' })).not.toBeInTheDocument();
  });

  it('says why the checking AI left the artwork as it is', async () => {
    const { api } = createFakeApi([mug()]);
    api.checkPrint.mockResolvedValue(printCheckDto({ turnsToFit: true }));
    const design = await api.getDesign({ id: 'id-01-mug' });
    api.rotateDesign.mockResolvedValueOnce({
      status: 'kept',
      reason: 'A repeating pattern with no top.',
      design,
    });
    const { user } = await renderApp(api, '/designs/id-01-mug');

    await user.click(await screen.findByRole('button', { name: 'Turn to fit' }));

    expect(
      await screen.findByText('Left as it is: A repeating pattern with no top.'),
    ).toBeInTheDocument();
  });

  it('says why the artwork was left as it is when the AI was asked on an earlier visit', async () => {
    const { api } = createFakeApi([
      { ...mug(), keptOrientationReason: 'The chair reads upright as it hangs.' },
    ]);
    api.checkPrint.mockResolvedValue(printCheckDto({ turnsToFit: true }));
    await renderApp(api, '/designs/id-01-mug');

    expect(
      await screen.findByText('Left as it is: The chair reads upright as it hangs.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Turn to fit' })).not.toBeInTheDocument();
  });

  it('offers nothing when the artwork fits the area as it is', async () => {
    const { api } = createFakeApi([mug()]);
    await renderApp(api, '/designs/id-01-mug');

    await screen.findByRole('heading', { name: 'Print check' });
    expect(screen.queryByRole('button', { name: 'Turn to fit' })).not.toBeInTheDocument();
  });
});
