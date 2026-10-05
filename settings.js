(() => {
  "use strict";

  // Both the popup and every content-script frame use the same storage schema.
  const DEFAULTS = Object.freeze({
    rewindSeconds: 5,
    forwardSeconds: 5,
    fastRate: 2,
    spaceHoldEnabled: true,
    mouseHoldEnabled: true,
    doubleClickEnabled: true,
    rightClickRewindEnabled: true,
    volumeKeysEnabled: true,
    volumeStep: 5,
    jklEnabled: true,
    muteKeyEnabled: true,
    overlaysEnabled: true,
    language: "auto"
  });
  const RATES = Object.freeze([1.25, 1.5, 1.75, 2, 2.5, 3, 4]);
  const MIN_SEEK_SECONDS = 1;
  const MAX_SEEK_SECONDS = 120;
  const MIN_VOLUME_STEP = 1;
  const MAX_VOLUME_STEP = 25;

  // Empty fields and malformed stored values revert to defaults, not zero.
  function clampInteger(value, fallback, min, max) {
    if (value == null || typeof value === "boolean" || String(value).trim() === "") return fallback;
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.round(number))) : fallback;
  }

  function clampSeek(value, fallback = DEFAULTS.rewindSeconds) {
    return clampInteger(value, fallback, MIN_SEEK_SECONDS, MAX_SEEK_SECONDS);
  }

  function clampVolumeStep(value, fallback = DEFAULTS.volumeStep) {
    return clampInteger(value, fallback, MIN_VOLUME_STEP, MAX_VOLUME_STEP);
  }

  function validRate(value) {
    const number = Number(value);
    return RATES.includes(number) ? number : DEFAULTS.fastRate;
  }

  function normalize(raw = {}) {
    const normalized = { ...DEFAULTS };
    for (const key of Object.keys(DEFAULTS)) {
      if (typeof DEFAULTS[key] === "boolean") normalized[key] = raw[key] !== false;
    }
    normalized.rewindSeconds = clampSeek(raw.rewindSeconds);
    normalized.forwardSeconds = clampSeek(raw.forwardSeconds, DEFAULTS.forwardSeconds);
    normalized.fastRate = validRate(raw.fastRate);
    normalized.volumeStep = clampVolumeStep(raw.volumeStep);
    normalized.language = typeof raw.language === "string" && raw.language.trim()
      ? raw.language : DEFAULTS.language;
    return normalized;
  }

  globalThis.WPT_SETTINGS = Object.freeze({
    DEFAULTS, RATES, MIN_SEEK_SECONDS, MAX_SEEK_SECONDS,
    MIN_VOLUME_STEP, MAX_VOLUME_STEP, clampSeek, clampVolumeStep, validRate, normalize
  });
})();
