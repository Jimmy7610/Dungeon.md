import './styles/main.css';
import { AppController } from './ui/AppController.ts';

/**
 * Entry point. Anything that escapes the app boot is shown to the user as a
 * readable panel rather than a blank page.
 */
function fail(error: unknown): void {
  console.error('[dungeon.md]', error);
  const host = document.getElementById('stage') ?? document.body;
  const panel = document.createElement('div');
  panel.className = 'stage-overlay';
  panel.innerHTML =
    '<div class="panel"><h3>Dungeon.md failed to start</h3>' +
    '<p class="muted">Reload the page to try again. The details are in the browser console.</p></div>';
  host.append(panel);
}

try {
  const app = new AppController();
  // Keep a handle for debugging in the console; nothing reads it back.
  (window as unknown as { dungeonMd?: AppController }).dungeonMd = app;
} catch (error) {
  fail(error);
}

window.addEventListener('error', (event) => console.error('[dungeon.md]', event.error));
window.addEventListener('unhandledrejection', (event) =>
  console.error('[dungeon.md]', event.reason),
);
