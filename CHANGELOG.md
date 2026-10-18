# Changelog

## 1.1.0 — 2026-10-18

### Added

- Playback-speed dropdown with presets, a 1× reset and custom intermediate
  values from 0.25× to 4×, rounded to two decimal places. Changes apply to the
  current Webex tab and its synchronized media; the last custom input is saved
  for reuse without automatically applying it to new recordings.
- Independent custom hold-speed targets from 0.25× to 4× for Space and mouse.
- Actual playback speed in the native Webex toolbar, including custom values,
  temporary holds and the restored speed after release.
- Native Chrome extension metadata localization for all 14 interface languages.
- Translated settings save/load/reset error messages in all 14 languages.

### Changed

- Holds use the greater of the permanent speed and hold target. A 3× permanent
  speed with a 2× target stays at 3×; equal speeds remain unchanged. Release
  restores the latest selected permanent speed and original playback state.
- Hold indicators show the effective speed from their first frame.
- Dropdowns have subtler focus styling without a glow while open, and the
  hold-speed selector has clearer spacing from the Spacebar setting.
- Normalize the store icon to 128×128 pixels and retain the published store link.
- Update English documentation and settings illustrations for custom speeds.

### Fixed

- Native Webex speed menus remain clickable without triggering seeking,
  delayed play/pause or temporary mouse holds, including shadow-root controls.
- Side double-clicks seek instead of triggering native zoom/fullscreen. Each
  additional same-side click adds one step; center double-click behavior remains native.
- Right-click rewind works when the native player suppresses its context menu.
- Mouse holds work when native handlers consume pointer-down events. The click
  generated on release preserves the original paused or playing state.
- Space and J/K/L shortcuts work when the video has focus, while focused
  interactive controls keep their own keyboard behavior.

## 1.0.0

Initial documented release of Webex Power Tools.

- Configurable seeking, side double-click gestures, and right-click seeking.
- After the first side double-click, every additional same-side click adds another seek step.
- Temporary speed through Space/mouse holds, with original-rate and paused-state restoration.
- J/K/L shortcuts, volume arrow keys, and reversible mute with M.
- On-screen speed, seek, volume, and mute indicators.
- Synced settings and 14 interface languages, including Arabic RTL.
- Toolbar popup and floating launcher when unpinned.
- Shared validation, English documentation, visuals, and reproducible development checks.
