import { describe, expect, it } from 'vitest';
import { connect, fakeApi, mockup } from '../testing/fake-catalog-api.js';

describe('print tools', () => {
  it('maps the print tools to API requests', async () => {
    const api = fakeApi();
    const client = await connect(api);

    const check = await client.callTool({
      name: 'check_print',
      arguments: { design_id: 'd1', fit: 'contain' },
    });
    const made = await client.callTool({
      name: 'create_mockups',
      arguments: { design_id: 'd1', variant_id: '4830', print_area: 'back', fit: 'cover' },
    });
    const listed = await client.callTool({ name: 'list_mockups', arguments: { design_id: 'd1' } });

    expect(api.checkPrint).toHaveBeenCalledWith({
      designId: 'd1',
      variantId: undefined,
      fit: 'contain',
    });
    expect(check.structuredContent).toMatchObject({
      effectiveDpi: 470,
      quality: 'good',
      printArea: 'default',
      area: { placement: 'default', width: 2700, height: 1050, dpi: 300 },
      variants: [{ id: '1320', color: 'White', size: '11 oz', areas: ['default'] }],
      productFacts: { material: 'White ceramic', care: 'Dishwasher safe' },
    });
    expect(api.createMockups).toHaveBeenCalledWith({
      designId: 'd1',
      variantId: '4830',
      printArea: 'back',
      fit: 'cover',
    });
    expect(made.structuredContent).toEqual({ mockups: [mockup] });
    expect(api.listMockups).toHaveBeenCalledWith({ id: 'd1' });
    expect(listed.structuredContent).toEqual({ mockups: [mockup] });
  });

  it('reports no area when the checked variant is missing from the list', async () => {
    const api = fakeApi();
    const check = await api.checkPrint();
    api.checkPrint.mockResolvedValueOnce({ ...check, variantId: 'gone' });

    const result = await (
      await connect(api)
    ).callTool({
      name: 'check_print',
      arguments: { design_id: 'd1', fit: 'contain' },
    });

    expect(result.structuredContent).toMatchObject({ area: null });
  });
});
