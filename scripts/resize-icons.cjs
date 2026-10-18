// Export Chrome's required PNG sizes from the approved high-resolution icon.
const fs = require('node:fs');
const path = require('node:path');
const sharp = process.env.WPT_NODE_MODULES
  ? require(path.join(process.env.WPT_NODE_MODULES, 'sharp')) : require('sharp');
const root = path.resolve(__dirname, '..');
async function main() {
  const master = path.join(root, 'docs', 'images', 'icon-master.png');
  for (const size of [16, 32, 48, 128]) {
    const background = { r: 0, g: 0, b: 0, alpha: 0 };
    // Normalize the Store icon to 96 px of artwork with 16 px transparent margins.
    const exportIcon = size === 128
      ? sharp(master).trim().resize(96, 96, { fit: 'contain', background })
        .extend({ top: 16, bottom: 16, left: 16, right: 16, background })
      : sharp(master).resize(size, size, { fit: 'contain', background });
    await exportIcon.png().toFile(path.join(root, `icon${size}.png`));
  }
  await sharp(master).resize(512, 512).png().toFile(path.join(root, 'docs', 'images', 'icon-preview.png'));
  console.log('Exported 16, 32, 48, 128 px icons and 512 px documentation preview.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
