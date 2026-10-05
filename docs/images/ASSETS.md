# Visual asset notes

## Icon

`icon-master.png` was generated with the built-in ImageGen tool using the user's
supplied promotional image as a reference. `icon-preview.png` is a 512 px export.
The extension's root PNG icons are exported at 16, 32, 48, and 128 px, preserving
transparency. The previous metallic-play icon and decorative dots were replaced.

Final prompt:

> Use case: precise-object-edit / background-extraction. Asset type: square Chrome extension icon for Webex Power Tools. Input image: reference and extraction target. Recreate ONLY the large app icon in the upper LEFT corner of the supplied reference, closely preserving its exact appearance and proportions. Deliver a single square, high-resolution 1024 by 1024 icon with transparent pixels outside its rounded-square silhouette. The icon must fill almost the entire canvas, face-on, no perspective. Keep the dark midnight blue-black rounded square, subtly illuminated blue upper-left edge, thin blue-gray rounded border. Inside: two flat solid bright cyan rewind triangles pointing LEFT, one large flat solid white rounded play triangle pointing RIGHT in the center, two flat solid neon lime green forward triangles pointing RIGHT on the right. At the bottom, a thin horizontal rounded-ended progress bar transitions smoothly from cyan to blue to green. Faithful to the reference icon; no metallic triangle, no dotted decoration, no text, no drop shadow outside the icon, no extra icons, no screenshot UI, no background scene. Preserve transparent corners. This replaces a different old extension icon.

## Documentation images

`settings.png` is a full-page capture of the production English popup using mocked
Chrome storage. `overview.svg` embeds that capture and the runtime icon alongside
an illustrative player with the exact 25% / 50% / 25% gesture zones. `overview.png`
is its browser-rendered 1600 × 1000 export. No real recording content is included.

Regeneration commands are in the [developer guide](../DEVELOPMENT.md).
