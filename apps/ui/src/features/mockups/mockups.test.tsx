import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createFakeApi, mockupDto } from '../../testing/fake-api.js';
import { renderApp } from '../../testing/render-app.js';
import { apiError, mug } from '../../testing/print.js';

describe('mockups', () => {
  it('creates mockups for the chosen variant, shows them and says they are ready', async () => {
    const { api } = createFakeApi([mug()]);
    const { user } = await renderApp(api, '/designs/id-01-mug');

    expect(await screen.findByText('No mockups yet.')).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Create mockups' }));

    const gallery = within(await screen.findByRole('list', { name: 'Mockups' }));
    expect(gallery.getAllByRole('img').map((image) => image.getAttribute('alt'))).toEqual([
      'Product image of 01-mug',
      'Product image of 01-mug',
    ]);
    expect(gallery.getByText('White Glossy Mug 11 oz · Front')).toBeInTheDocument();
    expect(gallery.getByText('White Glossy Mug 11 oz · Left')).toBeInTheDocument();
    expect(api.createMockups).toHaveBeenCalledWith({
      designId: 'id-01-mug',
      variantId: '1320',
      printArea: 'default',
      fit: 'contain',
    });
    expect(screen.getByText('The mockups are ready.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create new mockups' })).toBeInTheDocument();
    await waitFor(() => {
      const next = within(screen.getByRole('list', { name: 'Next steps' }));
      expect(next.getAllByRole('listitem').map((step) => step.textContent)).toEqual([
        'Listing text',
        'Etsy draft',
        'Pinterest',
      ]);
    });
  });

  it('keeps focus on the button and shows the running state after coming back', async () => {
    const { api } = createFakeApi([mug()]);
    api.createMockups.mockReturnValueOnce(new Promise(() => undefined));
    const { user } = await renderApp(api, '/designs/id-01-mug');

    const button = await screen.findByRole('button', { name: 'Create mockups' });
    await waitFor(() => {
      expect(button).toBeEnabled();
    });
    await user.click(button);

    expect(
      screen.getByText('Printful is making the images. This usually takes a minute or two.'),
    ).toBeInTheDocument();
    expect(button).toHaveFocus();
    expect(button).toHaveAttribute('aria-disabled', 'true');
    await user.click(button);
    expect(api.createMockups).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('link', { name: 'All designs' }));
    await user.click(await screen.findByRole('link', { name: /^01-mug,/ }));
    expect(
      await screen.findByText('Printful is making the images. This usually takes a minute or two.'),
    ).toBeInTheDocument();
  });

  it('sends the user to the settings when a connection is missing', async () => {
    const { api } = createFakeApi([mug()]);
    api.createMockups.mockRejectedValueOnce(apiError('FILE_HOST_NOT_CONNECTED'));
    await api.connectSignIn({ service: 'pinterest', appId: '1', appSecret: 's' });
    const { user } = await renderApp(api, '/designs/id-01-mug');

    await user.click(await screen.findByRole('button', { name: 'Create mockups' }));

    expect(
      await screen.findByText('Connect Dropbox, Cloudflare R2 or S3 in the settings first.'),
    ).toBeInTheDocument();
    await user.click(screen.getAllByRole('link', { name: 'Open settings' })[0] as HTMLElement);
    expect(await screen.findByRole('heading', { name: 'Connections' })).toBeInTheDocument();
  });

  it('shows a failure with technical details when the provider failed', async () => {
    const { api } = createFakeApi([mug()]);
    api.createMockups.mockRejectedValueOnce(
      apiError('PROVIDER_FAILED', { service: 'Printful', reason: 'Printful returned 500: busy' }),
    );
    await api.connectSignIn({ service: 'pinterest', appId: '1', appSecret: 's' });
    const { user } = await renderApp(api, '/designs/id-01-mug');

    await user.click(await screen.findByRole('button', { name: 'Create mockups' }));

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Technical details')).toBeInTheDocument();
    expect(alert).toHaveTextContent('Printful returned 500: busy');
    expect(screen.queryByText(/^Connect .* in the settings first\.$/)).not.toBeInTheDocument();
  });

  it('warns that a request that broke off may still have been done and billed', async () => {
    const { api } = createFakeApi([mug()]);
    api.createMockups.mockRejectedValueOnce(
      apiError('PROVIDER_INTERRUPTED', { service: 'Printful', reason: 'connection lost' }),
    );
    const { user } = await renderApp(api, '/designs/id-01-mug');

    await user.click(await screen.findByRole('button', { name: 'Create mockups' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'It may still have done the work and charged for it: check before trying again.',
    );
    expect(alert).toHaveTextContent('connection lost');
  });

  it('shows a failed run again after coming back to the design', async () => {
    const { api } = createFakeApi([mug()]);
    api.createMockups.mockRejectedValueOnce(apiError('PROVIDER_FAILED', { reason: 'busy' }));
    const { user } = await renderApp(api, '/designs/id-01-mug');
    await user.click(await screen.findByRole('button', { name: 'Create mockups' }));
    await screen.findByRole('alert');

    await user.click(screen.getByRole('link', { name: 'All designs' }));
    await user.click(await screen.findByRole('link', { name: /^01-mug,/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('busy');
  });

  it('names unknown views as Printful does and known ones in the user language', async () => {
    const { api } = createFakeApi([mug()]);
    await api.createMockups({ designId: 'id-01-mug', fit: 'contain' });
    api.listMockups.mockResolvedValue([
      { ...mockupDto('a', 'Front'), variantId: '1320' },
      { ...mockupDto('b', 'Lifestyle 2'), variantId: '1320' },
    ]);
    await renderApp(api, '/designs/id-01-mug', 'tr');

    expect(await screen.findByText('White Glossy Mug 11 oz · Ön')).toBeInTheDocument();
    expect(screen.getByText('White Glossy Mug 11 oz · Lifestyle 2')).toBeInTheDocument();
  });
});
