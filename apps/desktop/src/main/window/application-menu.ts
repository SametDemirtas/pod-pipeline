import { Menu } from 'electron';
import type { UiLanguage } from '@pod/contracts';
import { packagedMenuTemplate } from './menu-template.js';

/** Sets the installed app's menus, named in the seller's language. */
export function setPackagedApplicationMenu(platform: NodeJS.Platform, language: UiLanguage): void {
  Menu.setApplicationMenu(Menu.buildFromTemplate(packagedMenuTemplate(platform, language)));
}
