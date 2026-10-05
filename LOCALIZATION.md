# Webex Power Tools — Localization guide

## Canonical English terminology

These concepts are the source of truth for localization. Translators should preserve
the meaning and use the terminology normally used by media players in the target
language rather than translating word-for-word.

| Concept | Canonical English |
|---|---|
| Main section | Playback |
| Move to another point in the recording | Seek backward / Seek forward |
| Temporary speed while holding a control | Hold to speed up |
| Playback rate | Playback speed |
| Toggle playback | Play / Pause |
| Audio toggle | Mute / Unmute |
| Return audio after the extension muted it | Restore previous volume level |
| Amount changed by each volume key press | Volume step |
| Keyboard controls | Keyboard shortcuts |
| Visual feedback over the video | On-screen indicators |
| Fill the display with the player | Fullscreen |
| Double-click action areas | Double-click sides |
| Right mouse action | Right click to go back |

## Localization policy

- Do not translate software terminology literally when the target language has a
  standard media-player expression.
- Keep labels short; explanations can be more explicit.
- J/K/L, M, ↑/↓ and numeric fractions remain unchanged.
- Webex and Webex Power Tools remain untranslated.
- `pt` is currently European Portuguese.
- `zh-CN` uses Simplified Chinese; `zh-TW` uses Traditional Chinese terminology.
- Arabic uses RTL layout.
- English is the fallback for unsupported browser languages.

## Included languages

English, Italian, Spanish, German, French, European Portuguese, Simplified Chinese,
Traditional Chinese, Japanese, Korean, Polish, Dutch, Arabic and Russian.

## Maintenance

`i18n.js` contains English source strings, translations, and language metadata.
`flags/` contains referenced flags and the Automatic icon. English documentation
and visuals describe version 1.0; the interface retains all supported languages.

To add a language:

1. Translate every key from `messages.en` in a new dictionary.
2. Preserve interpolation variables such as `{language}` and `{value}` exactly.
3. Add metadata: code, native/English names, flag path, direction, and search aliases.
4. Add the flag and any regional resolution rules.
5. Compare dictionary keys and interpolation variables with English and check the browser layout.

Browser regional tags map to supported dictionaries. Traditional Chinese includes
Hant, Taiwan, Hong Kong, and Macau tags; other Chinese variants use Simplified.
Other languages use their base code. Missing keys fall back to English; unexpected
storage errors are currently shown in English.

Translations are inserted as text, never HTML. Search ignores Latin diacritics
and matches native names, English names, codes, and aliases. Arabic direction
also affects logical spacing and toggle movement.
