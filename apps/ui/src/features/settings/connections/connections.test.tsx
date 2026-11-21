import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApiError } from '@pod/contracts/client';
import { createFakeApi } from '../../../testing/fake-api.js';
import { renderApp } from '../../../testing/render-app.js';
import { confirmDisconnect } from '../../../testing/connections.js';

describe('connections', () => {
  it('warns when the Printful store syncs with no Etsy shop, or looks like another one', async () => {
    const { api } = createFakeApi([]);
    api.connectPrintful.mockResolvedValueOnce({
      ...(await api.getConnections()),
      printful: { storeName: 'Maple Lane', storeProblem: 'not-marketplace' },
    });
    const { user } = await renderApp(api, '/settings');
    await user.type(await screen.findByLabelText('Printful API token'), 'token');
    await user.click(screen.getByRole('button', { name: 'Connect' }));

    expect(
      await screen.findByText(/The Printful store Maple Lane is not connected to an Etsy shop/),
    ).toBeInTheDocument();
  });

  it('names both shops when the Printful store looks like another Etsy shop’s', async () => {
    const { api } = createFakeApi([]);
    api.getConnections.mockResolvedValue({
      ...(await api.getConnections()),
      printful: { storeName: 'Maple Lane', storeProblem: 'other-shop' },
      etsy: { shopName: 'MapleLaneStore' },
    });
    await renderApp(api, '/settings');

    expect(
      await screen.findByText(
        /The Printful store Maple Lane does not look like the one synced with your Etsy shop MapleLaneStore/,
      ),
    ).toBeInTheDocument();
  });

  it('connects Printful with a token and clears the field', async () => {
    const { api } = createFakeApi([]);
    const { user } = await renderApp(api, '/settings');

    const connect = await screen.findByRole('button', { name: 'Connect' });
    expect(connect).toBeDisabled();
    const token = screen.getByLabelText('Printful API token');
    expect(token).toHaveAttribute('type', 'password');
    await user.type(token, ' secret-token ');
    await user.click(connect);

    expect(api.connectPrintful).toHaveBeenCalledWith({ token: ' secret-token ' });
    expect(await screen.findByText('Connected to the store Example Store')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Disconnect' })[0]).toHaveFocus();
    expect(screen.queryByLabelText('Printful API token')).not.toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: 'Disconnect' })[0] as HTMLElement);
    const ask = await screen.findByRole('alertdialog', { name: 'Disconnect this service?' });
    expect(ask).toHaveTextContent('The app forgets the saved details.');
    await user.click(within(ask).getByRole('button', { name: 'Cancel' }));
    expect(api.disconnect).not.toHaveBeenCalled();
    await user.click(screen.getAllByRole('button', { name: 'Disconnect' })[0] as HTMLElement);
    await confirmDisconnect(user);
    expect(await screen.findByLabelText('Printful API token')).toHaveValue('');
  });

  it('shows why the connection failed', async () => {
    const { api } = createFakeApi([]);
    api.connectPrintful.mockRejectedValueOnce(
      new ApiError({
        code: 'CONNECTION_FAILED',
        message: 'x',
        details: { service: 'printful', reason: 'The access token provided is invalid' },
      }),
    );
    const { user } = await renderApp(api, '/settings');

    await user.type(await screen.findByLabelText('Printful API token'), 'bad');
    await user.click(screen.getByRole('button', { name: 'Connect' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'The connection did not work. Check the details and try again.',
    );
    expect(within(alert).getByText('Technical details')).toBeInTheDocument();
    expect(alert).toHaveTextContent('The access token provided is invalid');
  });

  it('connects Dropbox in two steps', async () => {
    const { api } = createFakeApi([]);
    const { user } = await renderApp(api, '/settings');

    await user.type(await screen.findByLabelText('Dropbox app key'), ' app-key ');
    await user.click(screen.getByRole('button', { name: 'Open Dropbox' }));
    expect(api.startDropbox).toHaveBeenCalledWith({ appKey: ' app-key ' });
    expect(await screen.findByRole('link', { name: 'Open the Dropbox page' })).toHaveAttribute(
      'href',
      'https://www.dropbox.com/oauth2/authorize?client_id=k',
    );
    await user.click(screen.getByRole('radio', { name: 'Cloudflare R2 or S3' }));
    await user.click(screen.getByRole('radio', { name: 'Dropbox' }));

    await user.type(await screen.findByLabelText('Code from Dropbox'), 'the-code');
    await user.click(screen.getByRole('button', { name: 'Finish' }));

    expect(api.finishDropbox).toHaveBeenCalledWith({ code: 'the-code' });
    expect(await screen.findByText('Using Dropbox')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Disconnect' }).at(-1)).toHaveFocus();
  });

  it('connects Cloudflare R2 once every field is filled', async () => {
    const { api } = createFakeApi([]);
    const { user } = await renderApp(api, '/settings');

    await user.click(await screen.findByRole('radio', { name: 'Cloudflare R2 or S3' }));
    const connect = screen.getAllByRole('button', { name: 'Connect' })[1] as HTMLElement;
    await user.type(screen.getByLabelText('Endpoint'), 'https://acc.r2.cloudflarestorage.com');
    await user.type(screen.getByLabelText('Bucket'), 'pod');
    await user.type(screen.getByLabelText('Access key ID'), 'key');
    expect(connect).toBeDisabled();
    expect(screen.getByLabelText('Secret access key')).toHaveAttribute('type', 'password');
    await user.type(screen.getByLabelText('Secret access key'), 'secret');
    await user.click(connect);

    expect(api.connectS3).toHaveBeenCalledWith({
      endpoint: 'https://acc.r2.cloudflarestorage.com',
      region: 'auto',
      bucket: 'pod',
      accessKeyId: 'key',
      secretAccessKey: 'secret',
    });
    expect(await screen.findByText('Using Cloudflare R2 or S3')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Disconnect' }));
    await confirmDisconnect(user);
    expect(await screen.findByLabelText('Endpoint')).toHaveValue('');
  });

  it('shows the statement Etsy asks of apps using its API', async () => {
    const { api } = createFakeApi([]);
    await renderApp(api, '/settings');

    expect(
      await screen.findByText(
        "The term 'Etsy' is a trademark of Etsy, Inc. This application uses the Etsy API but is not endorsed or certified by Etsy, Inc.",
      ),
    ).toBeInTheDocument();
  });

  it('offers a retry when the connections cannot be loaded', async () => {
    const { api } = createFakeApi([]);
    api.getConnections.mockRejectedValueOnce(new Error('offline'));
    const { user } = await renderApp(api, '/settings');

    await user.click(await screen.findByRole('button', { name: 'Try again' }));

    expect(await screen.findByLabelText('Printful API token')).toBeInTheDocument();
  });
});
