# Privacy and permissions

This describes Webex Power Tools 1.1 as implemented in this repository.

## Data handling

The extension reads HTML media state and matching page elements to control playback, seek, speed, volume, mute, and visual indicators. Playback state stays in content-script memory.

It does not implement analytics, advertising, remote code loading, recording downloads, or outbound network requests. It does not collect or transmit recording content, transcripts, account details, browsing history, or gesture logs to a project server. There is no project backend.

Preferences—including seek durations, speed, volume step, switches, and language—are saved in `chrome.storage.sync`. Chrome may synchronize them through the user's profile according to browser settings. Playback position, mute snapshots, and recording content are not persisted. See [Chrome's storage API](https://developer.chrome.com/docs/extensions/reference/api/storage#storage_areas).

The custom-speed control stores only its last successfully applied numeric input.
Requests to read or change the active recording's rate stay within extension
messages. Tab URLs, recording identifiers and per-recording speed history are
not saved. This control adds no permissions or external requests.

## Permissions and website access

| Declaration | Purpose |
| --- | --- |
| `storage` | Read/write preferences and react to changes |
| `declarativeContent` | Enable the toolbar action on HTTPS Webex hosts |
| `https://*.webex.com/*` content-script match | Run controls on `webex.com` and its subdomains |
| `all_frames`, `match_about_blank` | Support matching frames and eligible related blank frames |
| Web-accessible `icon48.png` on Webex | Display the floating launcher's icon |

The manifest does not request `tabs`, `history`, `cookies`, `downloads`, or all-website access. Content-script matches still authorize reading/modifying matching pages. Host wildcards include the root and subdomains: see [Chrome's match-pattern documentation](https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns).

## Removing preferences

**Restore defaults** replaces preferences with defaults; it is not a data-erasure command. Removing the extension clears its browser-managed extension storage. Chrome manages its own profile synchronization/removal behavior.

This extension is independent of Cisco/Webex. Chrome and Webex have their own data-handling policies.
