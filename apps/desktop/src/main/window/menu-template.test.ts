import { describe, expect, it } from 'vitest';
import { packagedMenuTemplate } from './menu-template.js';

describe('packagedMenuTemplate', () => {
  it('names the View menu in the seller language, with zoom and full screen only', () => {
    const view = (language: 'en' | 'tr' | 'de') =>
      packagedMenuTemplate('win32', language).find((menu) => menu.label !== undefined);

    expect(view('en')?.label).toBe('View');
    expect(view('tr')?.label).toBe('Görünüm');
    expect(view('de')?.label).toBe('Darstellung');
    expect(view('en')?.submenu).not.toContainEqual({ role: 'toggleDevTools' });
    expect(view('en')?.submenu).not.toContainEqual({ role: 'reload' });
  });

  it('adds the app and File menus on macOS only', () => {
    const roles = (platform: NodeJS.Platform) =>
      packagedMenuTemplate(platform, 'en').map((menu) => menu.role ?? menu.label);

    expect(roles('darwin')).toEqual(['appMenu', 'fileMenu', 'editMenu', 'View', 'windowMenu']);
    expect(roles('linux')).toEqual(['editMenu', 'View', 'windowMenu']);
  });
});
