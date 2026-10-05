// Render the complete English popup for documentation without accessing a Webex account.
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const playwright = process.env.WPT_NODE_MODULES
  ? require(path.join(process.env.WPT_NODE_MODULES, 'playwright')) : require('playwright');
const root = path.resolve(__dirname, '..');

async function main() {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  const browser = await playwright.chromium.launch({ headless: true, channel: process.env.WPT_BROWSER_CHANNEL || 'chromium' });
  try {
    const page = await browser.newPage({ viewport: { width: 420, height: 650 }, deviceScaleFactor: 2 });
    await page.addInitScript(({ version }) => {
      const preferences = { language: 'en' };
      globalThis.chrome = {
        i18n: { getUILanguage: () => 'en-US' },
        runtime: { getManifest: () => ({ version }) },
        storage: { sync: {
          get: (defaults, callback) => queueMicrotask(() => callback({ ...defaults, ...preferences })),
          set: (values, callback) => { Object.assign(preferences, values); queueMicrotask(() => callback?.()); }
        } }
      };
    }, { version: manifest.version });
    await page.goto(pathToFileURL(path.join(root, 'popup.html')).href);
    await page.waitForFunction(() => document.documentElement.lang === 'en' && document.getElementById('rewindSeconds').value === '5');
    await page.addStyleTag({ content: 'body { max-height: none; overflow: visible; }' });
    fs.mkdirSync(path.join(root, 'docs', 'images'), { recursive: true });
    await page.screenshot({ path: path.join(root, 'docs', 'images', 'settings.png'), fullPage: true });
    console.log('Created docs/images/settings.png from the English settings popup.');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
