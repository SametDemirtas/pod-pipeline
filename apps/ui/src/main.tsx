import '@radix-ui/themes/styles.css';
import './app/global.css';
import type { DesktopBridge } from '@pod/contracts/client';
import { startApp } from './app/start-app.js';

declare global {
  interface Window {
    /** Exposed by the desktop preload script. */
    readonly pod?: DesktopBridge;
  }
}

const root = document.getElementById('root');
if (!root) throw new Error('The page has no root element');
void startApp(root, window.pod, navigator.language);
