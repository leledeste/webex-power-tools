# Developer guide

## Architecture

This is a plain JavaScript Manifest V3 extension. Runtime files require no dependencies, bundler, or build step.

| File | Responsibility |
| --- | --- |
| `manifest.json` | Version, permissions, match patterns, entry points, and assets |
| `settings.js` | Shared defaults, bounds, rates, and normalization |
| `i18n.js` | Dictionaries, metadata, detection, search, and interpolation |
| `content.js` | Per-frame media discovery, gestures, restoration, overlays, and launcher |
| `background.js` | Webex action rules and asynchronous popup/toolbar requests |
| `popup.html`, `popup.css`, `popup.js` | Settings interface, language picker, and persistence |
| `flags/`, `icon*.png` | Runtime language and icon assets |
| `scripts/capture-settings.cjs` | English settings capture for documentation |
| `scripts/render-overview.cjs` | Reproducible documentation illustration |
| `scripts/resize-icons.cjs` | PNG size exports from the reference-matched master icon |
| `scripts/package.cjs` | Runtime-only release staging |

Content scripts load `settings.js`, `i18n.js`, then `content.js`. The popup loads both shared modules before `popup.js`. They expose `WPT_SETTINGS` and `WPT_I18N` inside the extension context; no page script injection is used. A guard prevents duplicate content handlers per frame.

## Media and event handling

Discovery traverses the document and open shadow roots. Matching frames run independent copies. Closed shadow roots and arbitrary cross-origin frames are not traversed.

Primary-media scoring favors a visible video, then playback activity, current time, readiness, and area. Non-ended elements are preferred; an ended fallback remains controllable for replay and seeking. This heuristic may need adjustment for multiple unrelated players.

Elements within 2.5 seconds of the primary timeline form a synchronized group for seek/speed. Volume and mute use its playing subset, or the entire group when paused. A speed hold resumes only the primary element if initially paused; Webex handles its own split-track playback synchronization.

Capture-phase input handlers cancel supported actions to prevent duplicate player behavior. Keyboard guards preserve editable and interactive targets, modifiers, and composition. Mouse guards inspect the first composed-path target to recognize controls in open shadow roots.

`HOLD_DELAY_MS = 180` separates taps from holds; `SINGLE_CLICK_DELAY_MS = 280` separates side taps from seeking. Space and mouse use separate active flags and one original-rate map. The final release restores rates. Focus loss/hidden documents cancel gestures, and disabling a hold cancels it without adding a Space tap.

After a side double-click, a separate media/side sequence accepts each further
click as another seek. Its `SEEK_CLICK_SEQUENCE_MS = 850` timer restarts per click.
The sequence is independent of overlay state; side changes, other clicks, holds,
focus loss, pointer cancellation, and feature disablement terminate it.

Mute snapshots save volume and `muted` per active element. The second M restores them, with fallback for replacement elements. Volume-up invalidates the snapshot. Weak collections track observations and audible levels; an active snapshot retains references until restored or overridden.

Overlays use text nodes, inline styles, and disabled pointer events. Fullscreen changes move them inside the fullscreen host. They are visual feedback with `aria-hidden`, not screen-reader announcements. Placement is calculated per action rather than continuously during resize.

Only the top frame creates the launcher. It polls toolbar pin state every four seconds and requests the popup in the sender's window. The launcher can appear on matching pages without media; playback shortcuts require media.

## Storage schema

Preferences are top-level `chrome.storage.sync` keys. Popup controls write only changed keys; reset writes all defaults. Content scripts consume `sync` changes. Removed keys regain defaults; unknown keys are ignored and left untouched.

| Key | Type | Default | Validation |
| --- | --- | --- | --- |
| `rewindSeconds`, `forwardSeconds` | number | 5 each | Integer, 1–120 |
| `fastRate` | number | 2 | 1.25, 1.5, 1.75, 2, 2.5, 3, 4 |
| `volumeStep` | number | 5 | Integer, 1–25 |
| `language` | string | `auto` | Supported code or resolver fallback |
| `spaceHoldEnabled` | boolean | true | Explicit `false` disables |
| `mouseHoldEnabled` | boolean | true | Explicit `false` disables |
| `doubleClickEnabled` | boolean | true | Explicit `false` disables |
| `rightClickRewindEnabled` | boolean | true | Explicit `false` disables |
| `volumeKeysEnabled` | boolean | true | Explicit `false` disables |
| `jklEnabled` | boolean | true | Explicit `false` disables |
| `muteKeyEnabled` | boolean | true | Explicit `false` disables |
| `overlaysEnabled` | boolean | true | Explicit `false` disables |

Empty/malformed/non-finite numeric values regain defaults. Numeric strings are accepted. Unsupported rates regain 2×. Defaults and validators live in `settings.js`.

## Service-worker messages

| Type | Success | Failure |
| --- | --- | --- |
| `wpt-get-toolbar-state` | `{ ok: true, isOnToolbar: boolean }` | `{ ok: false, isOnToolbar: true }` |
| `wpt-open-popup` | `{ ok: true }` | `{ ok: false, error: string }` |

The listener returns `true` for asynchronous requests to retain the response channel; other messages are ignored. Toolbar rules match exact `webex.com` or suffix `.webex.com` on HTTPS. Chrome 127 is the declared minimum for unrestricted `chrome.action.openPopup()`: see [Chrome's action API](https://developer.chrome.com/docs/extensions/reference/api/action#method-openPopup).

## Local development and documentation assets

Use Node.js 22+ for tooling and [load the extension unpacked](../README.md#install-locally). After edits, reload it in `chrome://extensions`, reopen the popup, and refresh Webex pages.

Syntax can be checked without installing dependencies:

```sh
node --check settings.js
node --check i18n.js
node --check content.js
node --check popup.js
node --check background.js
```

To regenerate documentation assets:

```sh
npm install
npx playwright install chromium
npm run capture:settings
npm run render:overview
```

To use installed Google Chrome instead:

```powershell
$env:WPT_BROWSER_CHANNEL = 'chrome'
npm run capture:settings
npm run render:overview
```

The capture script renders the production popup in English with in-memory Chrome storage fixtures and extends its viewport to show all settings. It does not access a Webex account. The overview generator embeds that capture and the existing icon into a standalone SVG and renders its PNG. Review both images after updates. `WPT_NODE_MODULES` optionally selects an external package directory; normal installations use local `node_modules`.

Automated checks used during development are kept locally and excluded from the published repository together with test results and agent configuration. See [review notes](AUDIT.md) for their scope and [manual release checks](RELEASE.md) for live Webex verification.

The icon master is `docs/images/icon-master.png`. Run `node scripts/resize-icons.cjs`
to export the 16, 32, 48, and 128 px runtime PNGs and the 512 px preview. See
[visual asset notes](images/ASSETS.md) for the source reference and generation prompt.

## Packaging and contributions

```sh
npm run package
```

Runtime files are staged in `dist/webex-power-tools-1.0.0/`. Existing output is never overwritten. Zip the contents, with `manifest.json` at the archive root. Documentation, tests, previews, and Node dependencies are excluded. Follow the [release checklist](RELEASE.md).

Keep runtime code dependency-free. Comment timing, browser constraints, guards, and restoration decisions rather than obvious assignments. Keep dictionaries aligned with English keys and interpolation variables. Update manifest/package versions, changelog, and versioned documentation for a release; the popup reads its version from the manifest. Distinguish fixture results from live Webex observations.
