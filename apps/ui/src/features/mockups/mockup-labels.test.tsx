import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  createFakeApi,
  designDto,
  mockupDto,
  printCheckDto,
  shirtVariants,
} from '../../testing/fake-api.js';
import { renderApp } from '../../testing/render-app.js';
import { mug } from '../../testing/print.js';

describe('photo labels', () => {
  it('names the print area under mockups of the front and the back', async () => {
    const { api } = createFakeApi([designDto('01-t-shirt')]);
    api.checkPrint.mockResolvedValue(
      printCheckDto({ variants: shirtVariants(), variantId: '4000', printArea: 'front' }),
    );
    api.listMockups.mockResolvedValue([
      mockupDto('a', 'Back', '4000', 'back'),
      mockupDto('b', 'Front', '4000', 'front'),
    ]);
    await renderApp(api, '/designs/id-01-t-shirt');

    const gallery = within(await screen.findByRole('list', { name: 'Mockups' }));
    expect(gallery.getByText('Shirt (Black / M) · Back · Back')).toBeInTheDocument();
    expect(gallery.getByText('Shirt (Black / M) · Front · Front')).toBeInTheDocument();
  });

  it('names the main view after its print area and tidies up unknown views', async () => {
    const { api } = createFakeApi([mug()]);
    api.listMockups.mockResolvedValue([mockupDto('a', 'default'), mockupDto('b', 'label_outside')]);
    await renderApp(api, '/designs/id-01-mug');

    const gallery = within(await screen.findByRole('list', { name: 'Mockups' }));
    expect(gallery.getByText('White Glossy Mug 11 oz · Front')).toBeInTheDocument();
    expect(gallery.getByText('White Glossy Mug 11 oz · Label outside')).toBeInTheDocument();
  });

  it('marks photos of an earlier revision and shows them last', async () => {
    const { api } = createFakeApi([mug()]);
    api.listMockups.mockResolvedValue([
      { ...mockupDto('old', 'Left'), designRevision: 0 },
      mockupDto('new', 'Right'),
    ]);
    await renderApp(api, '/designs/id-01-mug');

    const gallery = within(await screen.findByRole('list', { name: 'Mockups' }));
    const [first, second] = gallery.getAllByRole('listitem');
    expect(first).toHaveTextContent('Right');
    expect(first).not.toHaveTextContent('Older version');
    expect(second).toHaveTextContent('Left');
    expect(second).toHaveTextContent('Older version');
  });
});
