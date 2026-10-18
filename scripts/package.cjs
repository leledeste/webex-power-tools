// Include runtime files and the license notice; exclude development dependencies and docs.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
// A separate store build preserves an already-published GitHub release archive.
if (process.argv.slice(2).some(argument => argument !== '--store')) {
  throw new Error('Usage: node scripts/package.cjs [--store]');
}
const suffix = process.argv.includes('--store') ? '-chrome-store' : '';
const destination = path.join(root, 'dist', `webex-power-tools-${manifest.version}${suffix}`);
if (fs.existsSync(destination)) {
  throw new Error(`${destination} already exists. Move or remove that output before packaging again.`);
}
const files = ['LICENSE', 'manifest.json', 'settings.js', 'i18n.js', 'content.js', 'background.js',
  'popup.html', 'popup.css', 'popup.js', ...new Set(Object.values(manifest.icons))];
fs.mkdirSync(destination, { recursive: true });
for (const file of files) fs.copyFileSync(path.join(root, file), path.join(destination, file));
fs.cpSync(path.join(root, 'flags'), path.join(destination, 'flags'), { recursive: true });
fs.cpSync(path.join(root, '_locales'), path.join(destination, '_locales'), { recursive: true });
console.log(`Extension staged at ${destination}. Zip the contents of this directory for the Chrome Web Store.`);
