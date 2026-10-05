# Version 1.0 release checklist

## Manual validation

1. Check the JavaScript syntax following the developer guide and complete the checks below on the final distribution.
2. Load the runtime folder unpacked in Chrome 127+.
3. Verify the toolbar on the root Webex host and a real subdomain, and its disabled state on unrelated/lookalike hosts.
4. On an authorized Webex recording, test Space tap/hold, mouse hold, overlapping holds, J/K/L, M, ↑/↓, right-click, and both side double-click zones.
   After each initial side double-click, verify that the third/fourth clicks add
   one seek step each. Pause for over 850 ms and confirm another double-click is
   required. Repeat with indicators disabled and with custom seek durations.
5. Repeat holds while paused and with another base speed. Change focus during a hold and confirm restoration.
6. Verify fullscreen, native controls, frames, replay after completion, and split video/audio tracks.
7. Change settings while a recording is open; check persistence, reset, language selection, and Arabic RTL.
8. Pin/unpin the extension and verify its launcher opens the popup in the correct window.
9. Inspect extension/service-worker errors in `chrome://extensions`.

Fixtures cannot establish compatibility with every Webex player. Complete live checks before publishing.

## Package

```sh
npm run package
```

Zip the **contents** of `dist/webex-power-tools-1.0.0/`, with `manifest.json` at the archive root. The MIT license notice is included. Tests, documentation, screenshots, and dependencies are excluded. Review store disclosures against the runtime and provide an accessible privacy-policy URL as required by the publishing workflow.

## Replace the store placeholder

In `README.md`, replace this reference with the actual extension listing URL:

```markdown
[chrome-web-store]: https://chromewebstore.google.com/
```

Change **Chrome Web Store — listing coming soon** to **Install from the Chrome Web Store** and remove the placeholder notice. The homepage is not a published extension listing; no extension ID has been invented.

## Versions and images

Manifest/package versions are `1.0.0`; UI labels are `v1.0`. Update the changelog and documentation for future releases and regenerate images after UI/version changes.

`docs/images/overview.png` combines an illustrative player and the English popup. `docs/images/settings.png` shows the entire settings page. Review store-specific image dimensions and requirements when preparing a submission.
