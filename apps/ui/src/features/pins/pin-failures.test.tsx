import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApiError } from '@pod/contracts/client';
import { renderApp } from '../../testing/render-app.js';
import { TOMORROW, withPhotos, pinsList, findPins } from '../../testing/pins.js';

describe('pin failures', () => {
  it('shows why a pin failed and offers to try again', async () => {
    const { api } = await withPhotos();
    const failed = await api.planPin({
      designId: 'id-01-mug',
      mockupId: 'm-front',
      title: 'Failed pin',
      description: '',
      altText: '',
      headline: '',
      boardId: '5001',
      publishAt: TOMORROW,
    });
    api.listPins.mockResolvedValueOnce([
      { ...failed, state: 'failed', failure: 'Pinterest returned 400: Invalid board' },
    ]);
    api.publishPinNow.mockRejectedValueOnce(
      new ApiError({ code: 'PINTEREST_NOT_CONNECTED', message: 'x', details: {} }),
    );
    const { user } = await renderApp(api, '/designs/id-01-mug');

    expect(
      await (await findPins()).findByText('Pinterest returned 400: Invalid board'),
    ).toBeInTheDocument();
    await user.click(pinsList().getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Connect Pinterest in the settings first.')).toBeInTheDocument();
  });

  it('tells the seller to plan a pin again once its photo is outdated', async () => {
    const { api } = await withPhotos();
    const pin = await api.planPin({
      designId: 'id-01-mug',
      mockupId: 'm-front',
      title: 'Outdated pin',
      description: '',
      altText: '',
      headline: '',
      boardId: '5001',
      publishAt: TOMORROW,
    });
    api.listPins.mockResolvedValueOnce([
      { ...pin, state: 'failed', failure: 'gone', failureCode: 'PIN_PHOTO_OUTDATED' },
    ]);
    await renderApp(api, '/designs/id-01-mug');

    expect(
      await (await findPins()).findByText(/plan it again with a current photo/),
    ).toBeInTheDocument();
  });

  it('explains a failure in the seller’s language, and waits while a pin is publishing', async () => {
    const { api } = await withPhotos();
    const base = await api.planPin({
      designId: 'id-01-mug',
      mockupId: 'm-front',
      title: 'Lost pin',
      description: '',
      altText: '',
      headline: '',
      boardId: '5001',
      publishAt: TOMORROW,
    });
    api.listPins.mockResolvedValueOnce([
      {
        ...base,
        state: 'failed',
        failure: 'The app stopped while publishing',
        failureCode: 'PIN_OUTCOME_UNKNOWN',
      },
      { ...base, id: 'pin-2', title: 'Busy pin', state: 'publishing' },
      { ...base, id: 'pin-3', title: 'Late pin', publishAt: '2020-01-01T00:00:00.000Z' },
    ]);
    const { user } = await renderApp(api, '/designs/id-01-mug');
    const pins = await findPins();

    expect(await pins.findByText(/may already be on Pinterest/)).toBeInTheDocument();
    expect(pins.getByText('The app stopped while publishing')).toBeInTheDocument();
    expect(pins.getByText('Publishing')).toBeInTheDocument();
    expect(pins.getByRole('button', { name: 'Remove the pin Busy pin' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(pins.getByText(/Its time has passed/)).toBeInTheDocument();

    await user.click(pins.getAllByRole('button', { name: 'Try again' })[0] as HTMLElement);
    const confirm = within(
      await screen.findByRole('alertdialog', { name: 'Publish this pin again?' }),
    );
    expect(api.publishPinNow).not.toHaveBeenCalled();
    await user.click(confirm.getByRole('button', { name: 'Publish again' }));
    expect(api.publishPinNow).toHaveBeenCalledWith({ id: 'pin-1', confirmUnknown: true });
    await waitFor(() => {
      expect(pins.getByText('Lost pin').closest('li')).toHaveFocus();
    });
  });

  it('fills in the service and wait of a stored failure', async () => {
    const { api } = await withPhotos();
    const base = await api.planPin({
      designId: 'id-01-mug',
      mockupId: 'm-front',
      title: 'Busy pin',
      description: '',
      altText: '',
      headline: '',
      boardId: '5001',
      publishAt: TOMORROW,
    });
    api.listPins.mockResolvedValueOnce([
      { ...base, state: 'failed', failure: 'Too many requests', failureCode: 'PROVIDER_BUSY' },
    ]);
    await renderApp(api, '/designs/id-01-mug');
    const pins = await findPins();

    const message = await pins.findByText(/^Pinterest is busy/);
    expect(message).toHaveTextContent(/Try again in \S/);
    expect(message.textContent).not.toContain('{{');
  });

  it('reloads a pin the app refused to send again, so the seller can confirm', async () => {
    const { api } = await withPhotos();
    const planned = await api.planPin({
      designId: 'id-01-mug',
      mockupId: 'm-front',
      title: 'Lost pin',
      description: '',
      altText: '',
      headline: '',
      boardId: '5001',
      publishAt: TOMORROW,
    });
    const failed = { ...planned, state: 'failed' as const, failure: 'x' };
    api.listPins
      .mockResolvedValueOnce([failed])
      .mockResolvedValueOnce([{ ...failed, failureCode: 'PIN_OUTCOME_UNKNOWN' }]);
    api.publishPinNow.mockRejectedValueOnce(
      new ApiError({ code: 'PIN_OUTCOME_UNKNOWN', message: 'x', details: {} }),
    );
    const { user } = await renderApp(api, '/designs/id-01-mug');

    await user.click(await (await findPins()).findByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/may already be on Pinterest/);
    await user.click(pinsList().getByRole('button', { name: 'Try again' }));

    expect(
      await screen.findByRole('alertdialog', { name: 'Publish this pin again?' }),
    ).toBeInTheDocument();
  });
});
