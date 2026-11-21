import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { type PrintCheckDto, type PrintRequest } from '@pod/contracts/client';
import { createFakeApi, designDto, printCheckDto, shirtVariants } from '../../testing/fake-api.js';
import { renderApp } from '../../testing/render-app.js';
import { mug, apiError } from '../../testing/print.js';

describe('print check', () => {
  it('shows resolution, coverage and the print area, checking once on load', async () => {
    const { api } = createFakeApi([mug()]);
    await renderApp(api, '/designs/id-01-mug');

    expect(await screen.findByText('470 DPI')).toBeInTheDocument();
    expect(screen.getByText('Sharp')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Printful prints this area at 300 DPI; a design at that resolution or more prints sharp.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('91%')).toBeInTheDocument();
    expect(screen.getByText('0%')).toBeInTheDocument();
    expect(
      screen.getByRole('img', {
        name: 'Where the design lands on the Main print area of White Glossy Mug 11 oz',
      }),
    ).toBeInTheDocument();
    expect(api.checkPrint).toHaveBeenCalledTimes(1);
    expect(api.checkPrint).toHaveBeenCalledWith({ designId: 'id-01-mug', fit: 'contain' });
  });

  it('lists the product facts the seller keeps in the settings', async () => {
    const { api } = createFakeApi([mug()]);
    api.checkPrint.mockResolvedValue(
      printCheckDto({
        productFacts: { material: 'White ceramic', care: 'Dishwasher safe', fit: '', size: ' ' },
      }),
    );
    await renderApp(api, '/designs/id-01-mug');

    expect(await screen.findByText('White ceramic')).toBeInTheDocument();
    expect(screen.getByText('Dishwasher safe')).toBeInTheDocument();
    expect(screen.queryByText('Fit')).not.toBeInTheDocument();
    expect(screen.queryByText('Size and dimensions')).not.toBeInTheDocument();
  });

  it('checks again for another variant and placement', async () => {
    const { api } = createFakeApi([mug()]);
    const { user } = await renderApp(api, '/designs/id-01-mug');

    await user.click(await screen.findByRole('combobox', { name: 'Variant' }));
    await user.click(await screen.findByRole('option', { name: 'White Glossy Mug 15 oz' }));
    await user.click(screen.getByRole('radio', { name: 'Fill the print area' }));

    expect(await screen.findByText('426 DPI')).toBeInTheDocument();
    expect(screen.getByText('9%')).toBeInTheDocument();
    expect(api.checkPrint).toHaveBeenLastCalledWith({
      designId: 'id-01-mug',
      variantId: '4830',
      fit: 'cover',
    });
  });

  it('keeps the chosen variant and blocks mockups while its check is loading', async () => {
    const { api } = createFakeApi([mug()]);
    const { user } = await renderApp(api, '/designs/id-01-mug');
    await screen.findByText('470 DPI');
    let answer: (check: PrintCheckDto) => void = () => undefined;
    api.checkPrint.mockReturnValueOnce(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );

    await user.click(screen.getByRole('combobox', { name: 'Variant' }));
    await user.click(await screen.findByRole('option', { name: 'White Glossy Mug 15 oz' }));

    expect(screen.getByRole('combobox', { name: 'Variant' })).toHaveTextContent('15 oz');
    expect(screen.getByRole('button', { name: 'Create mockups' })).toBeDisabled();
    expect(screen.getByText('470 DPI').closest('[aria-busy="true"]')).not.toBeNull();

    answer(printCheckDto({ variantId: '4830', effectiveDpi: 410 }));
    await user.click(await screen.findByRole('button', { name: 'Create mockups' }));
    expect(api.createMockups).toHaveBeenCalledWith({
      designId: 'id-01-mug',
      variantId: '4830',
      printArea: 'default',
      fit: 'contain',
    });
  });

  it('keeps the options after a failed check and forgets a variant that is gone', async () => {
    const { api } = createFakeApi([mug()]);
    const { user } = await renderApp(api, '/designs/id-01-mug');
    await screen.findByText('470 DPI');
    api.checkPrint.mockRejectedValueOnce(apiError('NOT_FOUND'));

    await user.click(screen.getByRole('combobox', { name: 'Variant' }));
    await user.click(await screen.findByRole('option', { name: 'White Glossy Mug 15 oz' }));

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Variant' })).toHaveTextContent('11 oz');
    });
    expect(await screen.findByText('470 DPI')).toBeInTheDocument();
  });

  it('chooses a shirt by colour and size and prints it on the front or back', async () => {
    const { api } = createFakeApi([designDto('01-t-shirt')]);
    const shirt = (request: PrintRequest) =>
      printCheckDto({
        designId: request.designId,
        variants: shirtVariants(),
        variantId: request.variantId ?? '4000',
        printArea: request.printArea ?? 'front',
      });
    api.checkPrint.mockImplementation((request) => Promise.resolve(shirt(request)));
    const { user } = await renderApp(api, '/designs/id-01-t-shirt');

    expect(await screen.findByRole('combobox', { name: 'Color' })).toHaveTextContent('Black');
    expect(screen.queryByRole('combobox', { name: 'Variant' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('combobox', { name: 'Size' }));
    await user.click(await screen.findByRole('option', { name: 'L' }));
    await user.click(screen.getByRole('radio', { name: 'Back' }));
    await waitFor(() => {
      expect(api.checkPrint).toHaveBeenLastCalledWith({
        designId: 'id-01-t-shirt',
        variantId: '4001',
        printArea: 'back',
        fit: 'contain',
      });
    });

    await user.click(screen.getByRole('combobox', { name: 'Color' }));
    await user.click(await screen.findByRole('option', { name: 'White' }));

    await waitFor(() => {
      expect(api.checkPrint).toHaveBeenLastCalledWith({
        designId: 'id-01-t-shirt',
        variantId: '4011',
        fit: 'contain',
      });
    });
    expect(screen.getByRole('combobox', { name: 'Size' })).toHaveTextContent('L');
    expect(screen.queryByRole('radio', { name: 'Back' })).not.toBeInTheDocument();
  });
});
