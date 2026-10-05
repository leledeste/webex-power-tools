// Include runtime files and the license notice; exclude development dependencies and docs.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const destination = path.join(root, 'dist', `webex-power-tools-${manifest.version}`);
if (fs.existsSync(destination)) {
  throw new Error(`${destination} already exists. Move or remove that output before packaging again.`);
}
const files = ['LICENSE', 'manifest.json', 'settings.js', 'i18n.js', 'content.js', 'background.js',
  'popup.html', 'popup.css', 'popup.js', ...new Set(Object.values(manifest.icons))];
fs.mkdirSync(destination, { recursive: true });
for (const file of files) fs.copyFileSync(path.join(root, file), path.join(destination, file));
fs.cpSync(path.join(root, 'flags'), path.join(destination, 'flags'), { recursive: true });
console.log(`Extension staged at ${destination}. Zip the contents of this directory for the Chrome Web Store.`);
