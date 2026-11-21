import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createFakeApi, printCheckDto } from '../../testing/fake-api.js';
import { renderApp } from '../../testing/render-app.js';
import { apiError, mug } from '../../testing/print.js';

describe('upscaling', () => {
  it('offers to make blurry artwork larger, shows progress and then the larger revision', async () => {
    const { api, emitUpscaleProgress } = createFakeApi([mug()]);
    api.checkPrint.mockResolvedValue(printCheckDto({ quality: 'poor', effectiveDpi: 120 }));
    let finish: () => void = () => undefined;
    const upscale = api.upscaleDesign.getMockImplementation();
    api.upscaleDesign.mockImplementationOnce(
      (request) =>
        new Promise((resolve, reject) => {
          finish = () => {
            if (upscale) resolve(upscale(request));
            else reject(new Error('no fake upscaling'));
          };
        }),
    );
    const { user } = await renderApp(api, '/designs/id-01-mug');

    await user.click(await screen.findByRole('button', { name: 'Upscale 4×' }));
    emitUpscaleProgress({ designId: 'id-01-mug', share: 0.4 });

    const progress = await screen.findByRole('progressbar', { name: 'Upscaling progress' });
    await waitFor(() => {
      expect(progress).toHaveAttribute('aria-valuenow', '40');
    });
    expect(api.upscaleDesign).toHaveBeenCalledWith({ id: 'id-01-mug' });
    api.checkPrint.mockResolvedValue(printCheckDto());
    finish();

    expect(
      await screen.findByText(
        'Made 4× larger in the app with the Illustration model. The imported file is revision 1.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Upscale 4×' })).not.toBeInTheDocument();
  });

  it('offers to make a larger copy again while it is still too small', async () => {
    const { api } = createFakeApi([mug()]);
    api.checkPrint.mockResolvedValue(printCheckDto({ quality: 'poor', effectiveDpi: 120 }));
    const { user } = await renderApp(api, '/designs/id-01-mug');

    await user.click(await screen.findByRole('button', { name: 'Upscale 4×' }));

    expect(
      await screen.findByText(
        'Made 4× larger in the app with the Illustration model. The imported file is revision 1.',
      ),
    ).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Upscale 4×' })).toBeEnabled();
  });

  it('offers no more once the copy is as large as upscaling makes it', async () => {
    const { api } = createFakeApi([mug()]);
    api.checkPrint.mockResolvedValue(printCheckDto({ quality: 'poor', effectiveDpi: 120 }));
    api.upscaleDesign.mockRejectedValue(apiError('ARTWORK_TOO_SMALL_EVEN_UPSCALED'));
    const { user } = await renderApp(api, '/designs/id-01-mug');

    await user.click(await screen.findByRole('button', { name: 'Upscale 4×' }));

    expect(
      await screen.findByText(/already as large as upscaling can make it/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Upscale 4×' })).not.toBeInTheDocument();
  });

  it('offers nothing for sharp artwork', async () => {
    const { api } = createFakeApi([mug()]);
    await renderApp(api, '/designs/id-01-mug');

    await screen.findByText('Sharp');
    expect(screen.queryByRole('button', { name: 'Upscale 4×' })).not.toBeInTheDocument();
  });

  it('explains when the engine is not installed', async () => {
    const { api } = createFakeApi([mug()]);
    api.checkPrint.mockResolvedValue(printCheckDto({ quality: 'poor', effectiveDpi: 120 }));
    api.upscaleDesign.mockRejectedValue(apiError('UPSCALER_UNAVAILABLE'));
    const { user } = await renderApp(api, '/designs/id-01-mug');

    await user.click(await screen.findByRole('button', { name: 'Upscale 4×' }));

    expect(
      await screen.findByText(/The upscaling engine is not installed with this copy of the app/),
    ).toBeInTheDocument();
  });
});
