import { act, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApiError } from '@pod/contracts/client';
import { createFakeApi } from '../../../testing/fake-api.js';
import { renderApp } from '../../../testing/render-app.js';
import { queryKeys } from '../../../api/query-keys.js';
import { confirmDisconnect } from '../../../testing/connections.js';

describe('sign-in in the browser', () => {
  it('signs in with Etsy, telling the seller which callback address to add', async () => {
    const { api } = createFakeApi([]);
    let allow: () => void = () => undefined;
    api.connectSignIn.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          allow = () => {
            resolve({
              printful: null,
              fileHost: null,
              etsy: { shopName: 'ExampleShop' },
              ai: { anthropic: false, openai: false, deepseek: false, kimi: false, gemini: false },
              pinterest: null,
            });
          };
        }),
    );
    const { user } = await renderApp(api, '/settings');

    expect(await screen.findByText('http://localhost:3003/oauth/redirect')).toBeInTheDocument();
    const signIn = screen.getByRole('button', { name: 'Sign in with Etsy' });
    expect(signIn).toBeDisabled();
    await user.type(screen.getByLabelText('Keystring'), ' key ');
    await user.type(screen.getByLabelText('Shared secret'), 'secret');
    expect(screen.getByLabelText('Shared secret')).toHaveAttribute('type', 'password');
    await user.click(signIn);

    expect(api.connectSignIn).toHaveBeenCalledWith({
      service: 'etsy',
      keystring: ' key ',
      sharedSecret: 'secret',
    });
    expect(await screen.findByText(/Allow access in the browser window/)).toBeInTheDocument();
    allow();
    expect(await screen.findByText('Connected to the shop ExampleShop')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Disconnect' }));
    expect(await screen.findByRole('alertdialog')).toHaveTextContent(
      'sign in with Etsy in the browser once more',
    );
    await confirmDisconnect(user);
    expect(api.disconnect).toHaveBeenCalledWith({ service: 'etsy' });
    expect(await screen.findByLabelText('Keystring')).toHaveValue('');
  });

  it('asks to connect Etsy again when its renewed sign-in was not saved', async () => {
    const { api } = createFakeApi([]);
    await api.connectSignIn({ service: 'etsy', keystring: 'key', sharedSecret: 'secret' });
    const connections = await api.getConnections();
    api.getConnections.mockResolvedValue({ ...connections, reconnect: ['etsy'] });
    await renderApp(api, '/settings');

    expect(await screen.findByText(/The renewed Etsy sign-in could not be saved/)).toBeVisible();
    expect(screen.queryByText(/The renewed Pinterest sign-in/)).not.toBeInTheDocument();
  });

  it('shows the warning as soon as the app reports work that touched the sign-in', async () => {
    const { api, emitCatalogChanged } = createFakeApi([]);
    await api.connectSignIn({ service: 'pinterest', appId: '1', appSecret: 's' });
    await renderApp(api, '/settings');
    await screen.findByLabelText('Keystring');
    const connections = await api.getConnections();
    api.getConnections.mockResolvedValue({ ...connections, reconnect: ['pinterest'] });

    act(() => {
      emitCatalogChanged();
    });

    expect(
      await screen.findByText(/The renewed Pinterest sign-in could not be saved/),
    ).toBeVisible();
  });

  it('cancels a sign-in the seller gave up on, without an error', async () => {
    const { api } = createFakeApi([]);
    let fail: (error: unknown) => void = () => undefined;
    api.connectSignIn.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          fail = reject;
        }),
    );
    api.cancelSignIn.mockImplementationOnce(() => {
      fail(new ApiError({ code: 'CONNECTION_FAILED', message: 'x', details: { service: 'etsy' } }));
      return Promise.resolve({
        printful: { storeName: 'Store seen on cancelling' },
        fileHost: null,
        etsy: null,
        ai: { anthropic: false, openai: false, deepseek: false, kimi: false, gemini: false },
        pinterest: null,
      });
    });
    const { user, queryClient } = await renderApp(api, '/settings');

    await user.type(await screen.findByLabelText('Keystring'), 'key');
    await user.type(screen.getByLabelText('Shared secret'), 'secret');
    await user.click(screen.getByRole('button', { name: 'Sign in with Etsy' }));
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(api.cancelSignIn).toHaveBeenCalledWith({ service: 'etsy' });
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(queryClient.getQueryData(queryKeys.connections)).toMatchObject({
      printful: { storeName: 'Store seen on cancelling' },
    });
  });

  it('still shows a sign-in under way, and how it ended, after leaving the settings', async () => {
    const { api } = createFakeApi([]);
    let fail: (error: unknown) => void = () => undefined;
    api.connectSignIn.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          fail = reject;
        }),
    );
    const { user } = await renderApp(api, '/settings');

    await user.type(await screen.findByLabelText('Keystring'), 'key');
    await user.type(screen.getByLabelText('Shared secret'), 'secret');
    await user.click(screen.getByRole('button', { name: 'Sign in with Etsy' }));
    await user.click(screen.getByRole('link', { name: 'Designs' }));
    await user.click(await screen.findByRole('link', { name: 'Settings' }));

    expect(await screen.findByText(/Allow access in the browser window/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    act(() => {
      fail(new ApiError({ code: 'CONNECTION_FAILED', message: 'x', details: {} }));
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The connection did not work. Check the details and try again.',
    );
  });

  it('signs in with Pinterest and shows the account', async () => {
    const { api } = createFakeApi([]);
    const { user } = await renderApp(api, '/settings');

    expect(await screen.findByText('http://localhost:3004/oauth/redirect')).toBeInTheDocument();
    await user.type(screen.getByLabelText('App ID'), ' 1500 ');
    await user.type(screen.getByLabelText('App secret'), 'secret');
    await user.click(screen.getByRole('button', { name: 'Sign in with Pinterest' }));

    expect(api.connectSignIn).toHaveBeenCalledWith({
      service: 'pinterest',
      appId: ' 1500 ',
      appSecret: 'secret',
    });
    expect(await screen.findByText('Connected as example-pins')).toBeInTheDocument();

    const disconnects = screen.getAllByRole('button', { name: 'Disconnect' });
    await user.click(disconnects.at(-1) as HTMLElement);
    expect(await screen.findByRole('alertdialog')).toHaveTextContent(
      'planned pins are not published until you sign in with Pinterest',
    );
    await confirmDisconnect(user);
    expect(api.disconnect).toHaveBeenCalledWith({ service: 'pinterest' });
  });

  it('shows a failed cancel until the next sign-in starts', async () => {
    const { api } = createFakeApi([]);
    let finish: () => void = () => undefined;
    api.connectSignIn.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () => {
            void api.getConnections().then(resolve);
          };
        }),
    );
    api.cancelSignIn.mockRejectedValueOnce(
      new ApiError({ code: 'INTERNAL', message: 'x', details: {} }),
    );
    const { user } = await renderApp(api, '/settings');

    await user.type(await screen.findByLabelText('Keystring'), 'key');
    await user.type(screen.getByLabelText('Shared secret'), 'secret');
    await user.click(screen.getByRole('button', { name: 'Sign in with Etsy' }));
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    finish();
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    });
    await user.type(screen.getByLabelText('Keystring'), 'key');
    await user.type(screen.getByLabelText('Shared secret'), 'secret');
    await user.click(screen.getByRole('button', { name: 'Sign in with Etsy' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    finish();
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    });
  });
});
