(() => {
  "use strict";

  // Prevent duplicate handlers when the script is injected again into a frame.
  if (window.__webexPowerToolsInstalled) return;
  window.__webexPowerToolsInstalled = true;

  // A short delay separates a tap from a hold and single clicks from seeking.
  const HOLD_DELAY_MS = 180;
  const SINGLE_CLICK_DELAY_MS = 280;
  const SEEK_CLICK_SEQUENCE_MS = 850;
  const SEEK_OVERLAY_RESET_MS = 850;
  const VIDEO_SURFACE_SELECTOR = ".video-js, .wxp-video-wrapper, .vjs-tech, .vjs-poster, wxp-interaction-tips";

  const { DEFAULTS, MIN_VOLUME_STEP, MAX_VOLUME_STEP } = globalThis.WPT_SETTINGS;

  const settings = { ...DEFAULTS };
  const i18n = globalThis.WPT_I18N?.createTranslator?.(DEFAULTS.language) || {
    setLanguage() {},
    t(key) { return key; }
  };

  let spaceDown = false;
  let spaceTimer = null;
  let spaceHoldActivated = false;
  let spaceTapCancelled = false;

  let mouseDown = false;
  let mouseTimer = null;
  let mouseHoldActivated = false;
  let suppressNextClick = false;
  let mouseHoldClickState = null;
  let pendingSingleClickTimer = null;
  const clickSnapshots = new WeakMap();
  const bubbledPointerDown = new WeakSet();
  const capturedVideoGestures = new WeakSet();
  let nativeSideTap = null;
  let nativePointerSequence = false;
  // A double-click starts seeking; every extra click on that side extends it.
  let seekClickSequence = null;
  let seekClickSequenceTimer = null;

  // One snapshot is shared by overlapping mouse and Space holds.
  const originalRates = new Map();
  const expectedRates = new WeakMap();
  let holdPrimaryMedia = null;
  let holdStartedPaused = false;
  let muteSnapshot = null;

  const observedMedia = new WeakSet();
  const lastAudibleVolume = new WeakMap();
  let audioOverlayRefreshFrame = null;

  let speedBadge = null;
  let seekBadge = null;
  let seekBadgeTimer = null;
  let volumeBadge = null;
  let volumeBadgeTimer = null;
  let cumulativeSeekSeconds = 0;
  let cumulativeSeekDirection = null;
  let cumulativeSeekResetTimer = null;

  const LAUNCHER_ID = "webex-power-tools-launcher";
  let launcherCheckTimer = null;
  let rateLabelFrame = null;
  let rateLabelScope = null;
  let rateLabelObserver = null;

  function normalizeSettings(raw) {
    Object.assign(settings, globalThis.WPT_SETTINGS.normalize(raw));
    i18n.setLanguage(settings.language);
  }

  function loadSettings() {
    if (!chrome?.storage?.sync) return;

    chrome.storage.sync.get(DEFAULTS, (raw) => {
      if (chrome.runtime.lastError) return;
      normalizeSettings(raw);
      updateLauncherText();
    });
  }

  function hideAllOverlays() {
    hideSpeedBadge();

    if (audioOverlayRefreshFrame !== null) {
      cancelAnimationFrame(audioOverlayRefreshFrame);
      audioOverlayRefreshFrame = null;
    }

    if (seekBadgeTimer !== null) {
      clearTimeout(seekBadgeTimer);
      seekBadgeTimer = null;
    }
    if (seekBadge) {
      seekBadge.remove();
      seekBadge = null;
    }

    if (volumeBadgeTimer !== null) {
      clearTimeout(volumeBadgeTimer);
      volumeBadgeTimer = null;
    }
    if (volumeBadge) {
      volumeBadge.remove();
      volumeBadge = null;
    }
  }

  loadSettings();

  chrome?.storage?.onChanged?.addListener((changes, areaName) => {
    if (areaName !== "sync") return;

    // Removed storage keys regain defaults, just like a fresh installation.
    const next = { ...settings };
    for (const key of Object.keys(DEFAULTS)) {
      if (changes[key]) next[key] = changes[key].newValue;
    }
    normalizeSettings(next);
    if (!settings.doubleClickEnabled) {
      clearPendingSingleClick();
      clearSeekClickSequence();
    }
    if (!settings.overlaysEnabled) hideAllOverlays();
    if (changes.language) updateLauncherText();
    if (!settings.spaceHoldEnabled && spaceDown) {
      clearSpaceTimer();
      spaceTapCancelled = true;
      spaceHoldActivated = false;
      if (!mouseHoldActivated) restoreTemporarySpeed();
    }
    if (!settings.mouseHoldEnabled && mouseDown) {
      clearMouseTimer();
      mouseHoldActivated = false;
      if (!spaceHoldActivated) restoreTemporarySpeed();
    }
  });

  function isEditableTarget(target) {
    if (!(target instanceof Element)) return false;
    if (target.isContentEditable) return true;
    return Boolean(target.closest(
      'input, textarea, select, [contenteditable="true"], [contenteditable=""], [role="textbox"]'
    ));
  }

  function isInteractiveControl(event) {
    // closest() cannot cross a shadow root: inspect the full composed path.
    const selector = [
      "button",
      "a",
      "input",
      "textarea",
      "select",
      "label",
      "summary",
      "menu",
      "wxp-playback-rate-control",
      ".wxp-control-button",
      ".wxp-popover",
      ".vjs-control-bar",
      ".vjs-control",
      ".vjs-menu",
      ".vjs-popover",
      "[role='button']",
      "[role='slider']",
      "[role='menu']",
      "[role='menubar']",
      "[role='menuitem']",
      "[role='menuitemradio']",
      "[role='menuitemcheckbox']",
      "[role='listbox']",
      "[role='option']",
      "[role='combobox']",
      "[role='dialog']",
      "[role='checkbox']",
      "[role='radio']",
      "[role='textbox']",
      "[contenteditable='true']",
      "[contenteditable='']"
    ].join(",");
    return (event.composedPath?.() || [event.target]).some(node => {
      if (!(node instanceof Element)) return false;
      if (node.matches(selector)) return true;
      // Focusable menu entries sometimes lack roles; focusable player wrappers
      // containing media must remain eligible for video gestures.
      return node.matches("[tabindex]:not([tabindex='-1'])") &&
        !(node instanceof HTMLMediaElement) && !node.querySelector("video, audio") &&
        !node.shadowRoot?.querySelector("video, audio");
    });
  }

  function isMediaSurfaceEvent(event, media) {
    if (!media || isInteractiveControl(event) || !pointInsideElement(event.clientX, event.clientY, media)) return false;
    const target = event.composedPath?.()[0] || event.target;
    if (!(target instanceof Element)) return false;
    if (target === media || target.contains(media)) return true;

    // Webex can put a transparent gesture layer above the video. Accept a
    // shared-player layer covering the video, not smaller menus/control bars.
    const surface = target.getBoundingClientRect();
    const video = media.getBoundingClientRect();
    const tolerance = 8;
    if (Math.abs(surface.left - video.left) > tolerance ||
        Math.abs(surface.top - video.top) > tolerance ||
        Math.abs(surface.right - video.right) > tolerance ||
        Math.abs(surface.bottom - video.bottom) > tolerance) return false;
    for (let parent = target.parentElement; parent && parent !== document.body && parent !== document.documentElement; parent = parent.parentElement) {
      if (parent.contains(media)) return true;
    }
    return false;
  }

  function isKnownVideoSurface(event, media) {
    if (!isMediaSurfaceEvent(event, media)) return false;
    const target = event.composedPath?.()[0] || event.target;
    // Capture only exposed playback surfaces. Browser-native controls can
    // retarget their own events to a video with controls=true: leave those alone.
    if (target === media) return !media.controls;
    return !target.shadowRoot && target.matches(VIDEO_SURFACE_SELECTOR);
  }

  function scheduleAudioOverlayRefresh() {
    if (!settings.overlaysEnabled || !volumeBadge?.isConnected) return;
    if (audioOverlayRefreshFrame !== null) cancelAnimationFrame(audioOverlayRefreshFrame);

    audioOverlayRefreshFrame = requestAnimationFrame(() => {
      audioOverlayRefreshFrame = null;
      const primary = getPrimaryMedia();
      if (primary && volumeBadge?.isConnected) {
        showAudioBadge(primary, getActiveMediaGroup(primary));
      }
    });
  }

  function observeMediaElement(media) {
    if (!(media instanceof HTMLMediaElement) || observedMedia.has(media)) return;
    observedMedia.add(media);

    if (media.volume > 0) {
      lastAudibleVolume.set(media, media.volume);
    }

    media.addEventListener("volumechange", () => {
      if (media.volume > 0) {
        lastAudibleVolume.set(media, media.volume);
      }
      scheduleAudioOverlayRefresh();
    }, { passive: true });

    media.addEventListener("ratechange", () => {
      // Native Webex changes during a hold become the new rate to restore.
      // Keep matching expected values: several queued self-events may follow.
      if (originalRates.has(media) && media.playbackRate !== expectedRates.get(media)) {
        originalRates.set(media, media.playbackRate);
        writePlaybackRate(media, Math.max(media.playbackRate, settings.fastRate));
      }
      scheduleNativeRateLabel();
      if (!speedBadge?.isConnected) return;
      if (media !== holdPrimaryMedia && !originalRates.has(media)) return;

      const rate = Number.isFinite(media.playbackRate)
        ? media.playbackRate
        : settings.fastRate;
      speedBadge.textContent = `${rate}×`;
    }, { passive: true });
  }

  // Open shadow roots are traversed; frames run their own isolated copy.
  function collectMedia(root = document, out = []) {
    if (!root) return out;

    try {
      if (root.querySelectorAll) {
        root.querySelectorAll("video, audio").forEach((el) => {
          observeMediaElement(el);
          out.push(el);
        });
        root.querySelectorAll("*").forEach((el) => {
          if (el.shadowRoot) collectMedia(el.shadowRoot, out);
        });
      }
    } catch (_) {}

    return out;
  }

  function isVisible(el) {
    if (!(el instanceof Element)) return false;

    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);

    return (
      rect.width > 2 &&
      rect.height > 2 &&
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      Number(style.opacity || "1") > 0
    );
  }

  function mediaScore(el) {
    let score = 0;
    if (!el.paused && !el.ended) score += 1_000_000;
    if (el.currentTime > 0) score += 10_000;
    if (el.readyState >= 2) score += 1_000;

    if (isVisible(el)) {
      const r = el.getBoundingClientRect();
      // Prefer the visible video surface over a separate audio track for gestures.
      if (el.tagName === "VIDEO") score += 2_000_000;
      score += Math.min(r.width * r.height, 500_000);
    }

    return score;
  }

  function getPrimaryMedia() {
    const media = collectMedia();
    if (!media.length) return null;

    // Keep an ended recording controllable for replay or seeking backward.
    const candidates = media.filter(el => !el.ended);
    return (candidates.length ? candidates : media)
      .sort((a, b) => mediaScore(b) - mediaScore(a))[0] || null;
  }

  // Webex can split a recording across media elements with nearby timelines.
  function getSynchronizedMedia(primary) {
    if (!primary) return [];

    const related = collectMedia().filter((el) =>
      !el.ended &&
      Number.isFinite(el.currentTime) &&
      Math.abs(el.currentTime - primary.currentTime) < 2.5
    );

    return related.length ? related : [primary];
  }

  function getActiveMediaGroup(primary) {
    const related = getSynchronizedMedia(primary);
    const active = related.filter((media) => !media.paused && !media.ended);
    return active.length ? active : (related.length ? related : [primary]);
  }

  function writePlaybackRate(media, rate) {
    expectedRates.set(media, rate);
    media.playbackRate = rate;
    scheduleNativeRateLabel();
  }

  function nativePlayerScope(media) {
    // Wxp controls can sit outside the inner Video.js element. Prefer the
    // outer Webex player and never rewrite labels belonging to other players.
    let node = media;
    let legacy = null;
    while (node instanceof Element) {
      const webex = node.closest("wxp-player, .wxp-player");
      if (webex) return webex;
      legacy ||= node.closest(".video-js");
      node = node.getRootNode()?.host;
    }
    return legacy;
  }

  function scheduleNativeRateLabel() {
    if (rateLabelFrame !== null) return;
    rateLabelFrame = requestAnimationFrame(() => {
      rateLabelFrame = null;
      const media = getPrimaryMedia();
      const scope = media && nativePlayerScope(media);
      if (scope !== rateLabelScope) {
        rateLabelObserver?.disconnect();
        rateLabelScope = scope;
        rateLabelObserver = scope ? new MutationObserver(scheduleNativeRateLabel) : null;
      }
      if (!scope || !Number.isFinite(media.playbackRate) || media.playbackRate <= 0) return;
      // Webex snaps its displayed rate to its preset list. Correct only the
      // visible numeric labels, preserving controls, menus and their listeners.
      rateLabelObserver.disconnect();
      const labels = [];
      const roots = [];
      const collect = root => {
        roots.push(root);
        labels.push(...root.querySelectorAll(".wxp-playback-rate-button, .vjs-playback-rate-value"));
        root.querySelectorAll("*").forEach(element => { if (element.shadowRoot) collect(element.shadowRoot); });
      };
      collect(scope);
      for (const label of labels) {
        if (nativePlayerScope(label) !== scope) continue;
        const suffix = label.textContent.trim().match(/[xX×]$/)?.[0] || "×";
        const text = `${Number(media.playbackRate.toFixed(2))}${suffix}`;
        if (label.textContent !== text) label.textContent = text;
      }
      for (const root of roots) rateLabelObserver.observe(root, { childList: true, characterData: true, subtree: true });
    });
  }

  chrome.runtime.onMessage?.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "wpt-media-rate" || !["get", "set"].includes(message.action)) return;
    const rate = globalThis.WPT_SETTINGS.parsePlaybackRate(message.value);
    if (message.action === "set" && rate === null) {
      sendResponse({ ok: false, error: "invalid-rate" });
      return;
    }
    const primary = getPrimaryMedia();
    if (!primary) return; // Let another recording frame answer the broadcast.
    if (message.action === "set") {
      const group = new Set([...getSynchronizedMedia(primary), primary, ...originalRates.keys()]);
      const snapshot = [...group].map(media => [media, media.playbackRate, originalRates.get(media)]);
      try {
        for (const media of group) {
          if (originalRates.has(media)) originalRates.set(media, rate);
          writePlaybackRate(media, originalRates.has(media) ? Math.max(rate, settings.fastRate) : rate);
        }
      } catch (_) {
        // A rejected rate must not leave split audio/video tracks at different speeds.
        for (const [media, previous, original] of snapshot) {
          if (original !== undefined) originalRates.set(media, original);
          try { writePlaybackRate(media, previous); } catch (_) {}
        }
        sendResponse({ ok: false, error: "rate-unavailable" });
        return;
      }
    }
    sendResponse({ ok: true, rate: originalRates.get(primary) ?? primary.playbackRate });
  });

  function pointInsideElement(x, y, el) {
    if (!(el instanceof Element) || !isVisible(el)) return false;
    const r = el.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  function getVideoRegionAtPoint(x, y, media) {
    if (!media || !pointInsideElement(x, y, media)) return null;

    const r = media.getBoundingClientRect();
    const localX = x - r.left;
    const quarter = r.width / 4;

    if (localX < quarter) return "left";
    if (localX >= quarter * 3) return "right";
    return "center";
  }

  // Fullscreen overlays must live inside the fullscreen element.
  function getOverlayHost() {
    const fullscreen = document.fullscreenElement || document.webkitFullscreenElement || null;
    if (fullscreen && fullscreen instanceof HTMLElement) return fullscreen;
    return document.body || document.documentElement;
  }

  function appendOverlay(element) {
    try {
      getOverlayHost().appendChild(element);
    } catch (_) {
      try {
        (document.body || document.documentElement).appendChild(element);
      } catch (_) {}
    }
  }

  function moveActiveOverlaysToCurrentHost() {
    const host = getOverlayHost();
    for (const overlay of [speedBadge, seekBadge, volumeBadge]) {
      if (!overlay?.isConnected) continue;
      try {
        if (overlay.parentNode !== host) host.appendChild(overlay);
      } catch (_) {}
    }
  }

  function getOverlayReferenceRect(media) {
    if (media && isVisible(media)) return media.getBoundingClientRect();

    const primary = getPrimaryMedia();
    if (primary && isVisible(primary)) return primary.getBoundingClientRect();

    return {
      left: 0,
      top: 0,
      width: window.innerWidth,
      height: window.innerHeight,
      right: window.innerWidth,
      bottom: window.innerHeight
    };
  }

  function createWebexOverlay(text, options = {}) {
    const badge = document.createElement("div");
    badge.textContent = text;
    badge.setAttribute("aria-hidden", "true");

    Object.assign(badge.style, {
      position: "fixed",
      zIndex: "2147483647",
      display: "grid",
      placeItems: "center",
      minWidth: options.minWidth || "72px",
      minHeight: options.minHeight || "40px",
      padding: options.padding || "10px 16px",
      borderRadius: options.borderRadius || "14px",
      background: "rgba(26, 31, 38, 0.84)",
      color: "#ffffff",
      border: "1px solid rgba(255, 255, 255, 0.14)",
      boxShadow: "0 8px 24px rgba(0,0,0,.28)",
      backdropFilter: "blur(10px)",
      WebkitBackdropFilter: "blur(10px)",
      font: options.font || "700 16px/1 system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
      pointerEvents: "none",
      textAlign: "center",
      whiteSpace: "nowrap"
    });

    return badge;
  }

  function placeOverlayAtPoint(overlay, x, y) {
    overlay.style.left = `${x}px`;
    overlay.style.top = `${y}px`;
    overlay.style.transform = "translate(-50%, -50%)";
  }

  function getTopCenterPoint(media) {
    const r = getOverlayReferenceRect(media);
    return {
      x: r.left + r.width / 2,
      y: r.top + Math.max(34, Math.min(52, r.height * 0.08))
    };
  }

  function getCenterPoint(media) {
    const r = getOverlayReferenceRect(media);
    return {
      x: r.left + r.width / 2,
      y: r.top + r.height / 2
    };
  }

  function getSideToastPoint(media, direction) {
    const r = getOverlayReferenceRect(media);
    return {
      x: direction === "left" ? r.left + r.width * 0.18 : r.left + r.width * 0.82,
      y: r.top + r.height * 0.5
    };
  }

  function showSpeedBadge() {
    if (!settings.overlaysEnabled || speedBadge?.isConnected) return;

    const media = holdPrimaryMedia || getPrimaryMedia();
    // The configured hold target may be lower than the permanent rate. Show
    // the actual applied rate from the first frame, including rejected writes.
    const rate = Number.isFinite(media?.playbackRate) ? media.playbackRate : settings.fastRate;
    const point = getTopCenterPoint(media);
    speedBadge = createWebexOverlay(`${rate}×`, {
      minWidth: "68px",
      minHeight: "42px",
      padding: "10px 18px",
      borderRadius: "13px",
      font: "700 17px/1 system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    });

    placeOverlayAtPoint(speedBadge, point.x, point.y);
    appendOverlay(speedBadge);
  }

  function hideSpeedBadge() {
    if (speedBadge) {
      speedBadge.remove();
      speedBadge = null;
    }
  }

  function resetCumulativeSeekSoon() {
    if (cumulativeSeekResetTimer !== null) clearTimeout(cumulativeSeekResetTimer);

    cumulativeSeekResetTimer = setTimeout(() => {
      cumulativeSeekResetTimer = null;
      cumulativeSeekSeconds = 0;
      cumulativeSeekDirection = null;
    }, SEEK_OVERLAY_RESET_MS);
  }

  function registerCumulativeSeek(direction, seconds) {
    if (cumulativeSeekDirection === direction) cumulativeSeekSeconds += seconds;
    else {
      cumulativeSeekDirection = direction;
      cumulativeSeekSeconds = seconds;
    }

    resetCumulativeSeekSoon();
    return cumulativeSeekSeconds;
  }

  function showSeekBadge(media, direction, seconds) {
    if (!settings.overlaysEnabled || !media || !isVisible(media)) return;

    if (seekBadgeTimer !== null) clearTimeout(seekBadgeTimer);
    if (seekBadge) seekBadge.remove();

    const cumulative = registerCumulativeSeek(direction, seconds);
    const point = getSideToastPoint(media, direction);

    seekBadge = createWebexOverlay(
      direction === "left" ? `−${cumulative}s` : `+${cumulative}s`,
      {
        minWidth: "82px",
        minHeight: "48px",
        padding: "12px 18px",
        borderRadius: "15px",
        font: "700 18px/1 system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
      }
    );

    placeOverlayAtPoint(seekBadge, point.x, point.y);
    appendOverlay(seekBadge);

    seekBadgeTimer = setTimeout(() => {
      seekBadgeTimer = null;
      if (seekBadge) {
        seekBadge.remove();
        seekBadge = null;
      }
    }, 700);
  }

  function getAudioDisplayState(group, primary) {
    const media = group.length ? group : [primary];
    const allMuted = media.every((el) => el.muted || el.volume <= 0);
    const reference = media.find((el) => !el.muted && el.volume > 0) || primary || media[0];
    const percent = Math.round(Math.max(0, Math.min(1, reference?.volume ?? 1)) * 100);
    return { allMuted, percent };
  }

  function showAudioBadge(primary, group = getActiveMediaGroup(primary)) {
    if (!settings.overlaysEnabled || !primary || !isVisible(primary)) return;

    if (volumeBadgeTimer !== null) clearTimeout(volumeBadgeTimer);
    if (volumeBadge) volumeBadge.remove();

    const { allMuted, percent } = getAudioDisplayState(group, primary);
    const point = getCenterPoint(primary);
    const text = allMuted
      ? `${i18n.t("overlayMuted")} · ${percent}%`
      : `${i18n.t("overlayVolume")} ${percent}%`;

    volumeBadge = createWebexOverlay(text, {
      minWidth: "118px",
      minHeight: "42px",
      padding: "10px 16px",
      borderRadius: "13px",
      font: "700 15px/1 system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    });

    placeOverlayAtPoint(volumeBadge, point.x, point.y);
    appendOverlay(volumeBadge);

    volumeBadgeTimer = setTimeout(() => {
      volumeBadgeTimer = null;
      if (volumeBadge) {
        volumeBadge.remove();
        volumeBadge = null;
      }
    }, 650);
  }

  function getNextVolumePercent(currentPercent, direction) {
    const step = Math.max(MIN_VOLUME_STEP, Math.min(MAX_VOLUME_STEP, settings.volumeStep));
    const current = Math.max(0, Math.min(100, currentPercent));
    const quotient = current / step;
    const nearestInteger = Math.round(quotient);
    const isAligned = Math.abs(quotient - nearestInteger) < 0.0001;

    let target;
    if (isAligned) target = (nearestInteger + direction) * step;
    else if (direction > 0) target = Math.ceil(quotient) * step;
    else target = Math.floor(quotient) * step;

    return Math.max(0, Math.min(100, target));
  }

  function changeVolume(direction) {
    const primary = getPrimaryMedia();
    if (!primary) return;

    const group = getActiveMediaGroup(primary);

    for (const media of group) {
      try {
        const nextPercent = getNextVolumePercent(media.volume * 100, direction);
        media.volume = nextPercent / 100;

        // Volume-up is also an explicit request to hear audio.
        if (direction > 0 && media.muted) media.muted = false;
      } catch (_) {}
    }

    // Adjusting volume upward while M-muted is an explicit override, so do
    // not later restore an obsolete pre-mute snapshot.
    if (direction > 0) muteSnapshot = null;
    showAudioBadge(primary, group);
  }

  function toggleMute() {
    const primary = getPrimaryMedia();
    if (!primary) return;

    const group = getActiveMediaGroup(primary);

    // Second M press: restore the exact volume + muted state saved on the
    // previous M press. Webex often represents "mute" as volume=0 rather than
    // only using HTMLMediaElement.muted, so volume is part of the snapshot.
    if (muteSnapshot instanceof Map && muteSnapshot.size > 0) {
      const snapshot = muteSnapshot;
      const restored = new Set();

      // Use the primary saved state as fallback if Webex recreated a media
      // element between M presses.
      const primarySaved = snapshot.get(primary);
      const fallbackSaved =
        primarySaved ||
        [...snapshot.values()].find((state) => state && state.volume > 0) ||
        [...snapshot.values()][0] ||
        { volume: 1, muted: false };

      for (const [media, saved] of snapshot.entries()) {
        if (!(media instanceof HTMLMediaElement) || !media.isConnected) continue;

        try {
          media.volume = Math.max(0, Math.min(1, Number(saved.volume) || 0));
          media.muted = Boolean(saved.muted);
          restored.add(media);

          if (media.volume > 0) {
            lastAudibleVolume.set(media, media.volume);
          }
        } catch (_) {}
      }

      // If Webex replaced an element while muted, the replacement wasn't in
      // the snapshot. Restore it using the best saved state from the previous
      // active group instead of leaving it at zero.
      for (const media of group) {
        if (restored.has(media)) continue;

        try {
          const remembered = lastAudibleVolume.get(media);
          const restoredVolume =
            remembered > 0
              ? remembered
              : Math.max(0.01, Math.min(1, Number(fallbackSaved.volume) || 1));

          media.volume = restoredVolume;
          media.muted = Boolean(fallbackSaved.muted);

          lastAudibleVolume.set(media, restoredVolume);
        } catch (_) {}
      }

      muteSnapshot = null;
      showAudioBadge(primary, getActiveMediaGroup(primary));
      return;
    }

    // If the player is already at zero before M and there is no extension
    // snapshot, interpret M as "unmute". Restore the last known audible volume
    // per media, falling back to 100%.
    const alreadySilent =
      group.length > 0 &&
      group.every((media) => media.muted || media.volume <= 0.0001);

    if (alreadySilent) {
      for (const media of group) {
        try {
          const remembered = lastAudibleVolume.get(media);
          const restoredVolume = remembered > 0 ? remembered : 1;

          media.volume = restoredVolume;
          media.muted = false;
          lastAudibleVolume.set(media, restoredVolume);
        } catch (_) {}
      }

      muteSnapshot = null;
      showAudioBadge(primary, getActiveMediaGroup(primary));
      return;
    }

    // First M press: save BOTH volume and muted state for every active media
    // element, then drive volume to exactly zero. This mirrors how the Webex
    // player exposes mute and makes the second M press fully reversible.
    muteSnapshot = new Map();

    for (const media of group) {
      try {
        const savedVolume = Math.max(0, Math.min(1, media.volume));
        muteSnapshot.set(media, {
          volume: savedVolume,
          muted: Boolean(media.muted)
        });

        if (savedVolume > 0) {
          lastAudibleVolume.set(media, savedVolume);
        }

        media.volume = 0;
      } catch (_) {}
    }

    showAudioBadge(primary, group);
  }

  // Snapshot each original rate once; a paused player runs only during the hold.
  function activateTemporarySpeed() {
    const primary = getPrimaryMedia();
    if (!primary || primary.ended) return false;

    clearSeekClickSequence();
    clearPendingSingleClick();

    if (originalRates.size === 0) {
      holdPrimaryMedia = primary;
      holdStartedPaused = primary.paused;
      for (const media of getSynchronizedMedia(primary)) {
        originalRates.set(media, media.playbackRate);
      }
    }

    for (const media of originalRates.keys()) {
      try { writePlaybackRate(media, Math.max(originalRates.get(media), settings.fastRate)); } catch (_) {}
    }

    if (holdStartedPaused && holdPrimaryMedia?.paused) {
      try {
        const p = holdPrimaryMedia.play();
        if (p?.catch) p.catch(() => {});
      } catch (_) {}
    }

    showSpeedBadge();
    return true;
  }

  function restoreTemporarySpeed() {
    const shouldPauseAgain = holdStartedPaused;
    const mediaToPause = holdPrimaryMedia;

    for (const [media, rate] of originalRates.entries()) {
      try {
        if (media?.isConnected) writePlaybackRate(media, rate);
      } catch (_) {}
    }

    if (shouldPauseAgain && mediaToPause?.isConnected) {
      try { mediaToPause.pause(); } catch (_) {}
    }

    originalRates.clear();
    holdPrimaryMedia = null;
    holdStartedPaused = false;
    hideSpeedBadge();
  }

  function togglePlayback(media = getPrimaryMedia()) {
    if (!media) return;

    try {
      if (media.paused || media.ended) {
        const p = media.play();
        if (p?.catch) p.catch(() => {});
      } else {
        media.pause();
      }
    } catch (_) {}
  }

  function seekBy(direction) {
    const primary = getPrimaryMedia();
    if (!primary) return;

    const seconds = direction === "left" ? settings.rewindSeconds : settings.forwardSeconds;
    const delta = direction === "left" ? -seconds : seconds;

    for (const media of getSynchronizedMedia(primary)) {
      try {
        const duration = Number.isFinite(media.duration) && media.duration > 0
          ? media.duration
          : Infinity;
        media.currentTime = Math.max(0, Math.min(duration, media.currentTime + delta));
      } catch (_) {}
    }

    showSeekBadge(primary, direction, seconds);
  }

  function clearSpaceTimer() {
    if (spaceTimer !== null) {
      clearTimeout(spaceTimer);
      spaceTimer = null;
    }
  }

  function clearMouseTimer() {
    if (mouseTimer !== null) {
      clearTimeout(mouseTimer);
      mouseTimer = null;
    }
  }

  function clearPendingSingleClick() {
    if (pendingSingleClickTimer !== null) {
      clearTimeout(pendingSingleClickTimer);
      pendingSingleClickTimer = null;
    }
  }

  function clearSeekClickSequence() {
    if (seekClickSequenceTimer !== null) clearTimeout(seekClickSequenceTimer);
    seekClickSequenceTimer = null;
    seekClickSequence = null;
  }

  function extendSeekClickSequence(media, region) {
    clearSeekClickSequence();
    seekClickSequence = { media, region };
    seekClickSequenceTimer = setTimeout(clearSeekClickSequence, SEEK_CLICK_SEQUENCE_MS);
  }

  function keyboardShortcutAllowed(event) {
    return !event.defaultPrevented && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && !isEditableTarget(event.composedPath?.()[0] || event.target) &&
      !isInteractiveControl(event) && !event.isComposing;
  }

  function onKeyDown(event) {
    if (!keyboardShortcutAllowed(event)) return;

    const mediaShortcut =
      event.code === "ArrowUp" ||
      event.code === "ArrowDown" ||
      event.code === "KeyM" ||
      event.code === "KeyJ" ||
      event.code === "KeyK" ||
      event.code === "KeyL" ||
      event.code === "Space";

    // The content script is allowed on webex.com generally. Never steal a
    // keyboard shortcut unless this frame actually contains controllable media.
    if (mediaShortcut && !getPrimaryMedia()) return;

    if (settings.volumeKeysEnabled && (event.code === "ArrowUp" || event.code === "ArrowDown")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!event.repeat) changeVolume(event.code === "ArrowUp" ? 1 : -1);
      return;
    }

    if (settings.muteKeyEnabled && event.code === "KeyM") {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!event.repeat) toggleMute();
      return;
    }

    if (settings.jklEnabled && (event.code === "KeyJ" || event.code === "KeyK" || event.code === "KeyL")) {
      event.preventDefault();
      event.stopImmediatePropagation();

      if (!event.repeat) {
        if (event.code === "KeyJ") seekBy("left");
        else if (event.code === "KeyK") togglePlayback();
        else seekBy("right");
      }
      return;
    }

    if (event.code !== "Space") return;

    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.repeat || spaceDown) return;

    spaceDown = true;
    spaceHoldActivated = false;
    spaceTapCancelled = false;
    clearSpaceTimer();

    if (settings.spaceHoldEnabled) {
      spaceTimer = setTimeout(() => {
        spaceTimer = null;
        if (spaceDown && activateTemporarySpeed()) spaceHoldActivated = true;
      }, HOLD_DELAY_MS);
    }
  }

  function onKeyUp(event) {
    if (event.code !== "Space" || !spaceDown) return;

    // Always finish an active Space gesture, even if focus/modifiers changed
    // between keydown and keyup, so temporary speed can never get stuck.
    event.preventDefault();
    event.stopImmediatePropagation();

    spaceDown = false;
    clearSpaceTimer();

    if (spaceHoldActivated) {
      spaceHoldActivated = false;
      if (!mouseHoldActivated) restoreTemporarySpeed();
    } else if (!spaceTapCancelled && !mouseHoldActivated) {
      togglePlayback();
    }
    spaceTapCancelled = false;
  }

  function onPointerDown(event) {
    bubbledPointerDown.add(event);
    if (event.defaultPrevented) {
      nativePointerSequence = true;
      clearSeekClickSequence();
      nativeSideTap = null;
      finishMouseHold();
      suppressNextClick = false;
      return;
    }
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    const primary = getPrimaryMedia();
    if (!isMediaSurfaceEvent(event, primary)) {
      clearPendingSingleClick();
      clearSeekClickSequence();
      finishMouseHold();
      suppressNextClick = false;
      return;
    }

    mouseDown = true;
    mouseHoldActivated = false;
    suppressNextClick = false;
    mouseHoldClickState = null;

    if (!settings.mouseHoldEnabled) return;

    clearMouseTimer();
    mouseTimer = setTimeout(() => {
      mouseTimer = null;
      if (mouseDown && activateTemporarySpeed()) {
        mouseHoldActivated = true;
        suppressNextClick = true;
        clearPendingSingleClick();
      }
    }, HOLD_DELAY_MS);
  }

  function finishMouseHold() {
    if (!mouseDown && !mouseHoldActivated) return;

    mouseDown = false;
    clearMouseTimer();

    if (mouseHoldActivated) {
      // Preserve the pre-hold state through the release-generated click. A
      // player may toggle before the bubble fallback sees that click.
      mouseHoldClickState = {
        media: holdPrimaryMedia,
        paused: spaceHoldActivated ? false : holdStartedPaused
      };
      mouseHoldActivated = false;
      if (!spaceHoldActivated) restoreTemporarySpeed();
    }
  }

  function onPointerUp(event) {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    finishMouseHold();
  }

  function onPointerCancel() {
    finishMouseHold();
    suppressNextClick = false;
    mouseHoldClickState = null;
    clearSeekClickSequence();
  }

  // Only the initial side tap is delayed. Once seeking starts, every click seeks.
  function onClick(event) {
    const primary = getPrimaryMedia();
    const onSurface = event.button === 0 && isMediaSurfaceEvent(event, primary);
    const snapshot = clickSnapshots.get(event);
    const nativeMediaControl = snapshot?.media === primary &&
      (snapshot.rate !== primary.playbackRate || snapshot.volume !== primary.volume || snapshot.muted !== primary.muted);
    if (event.defaultPrevented || nativePointerSequence || nativeMediaControl) {
      nativePointerSequence = false;
      suppressNextClick = false;
      clearPendingSingleClick();
      clearSeekClickSequence();
      nativeSideTap = null;
      return;
    }
    if (suppressNextClick) {
      suppressNextClick = false;
      // Suppress only the synthetic click following a hold on the video.
      if (onSurface) {
        const releasedHold = mouseHoldClickState;
        mouseHoldClickState = null;
        if (releasedHold?.media === primary) restoreClickPlayback(primary, releasedHold.paused);
        else if (snapshot?.media === primary) restoreClickPlayback(primary, snapshot.paused);
        event.preventDefault();
        event.stopImmediatePropagation();
        clearPendingSingleClick();
        return;
      }
    }

    if (!onSurface || !settings.doubleClickEnabled) {
      clearPendingSingleClick();
      clearSeekClickSequence();
      nativeSideTap = null;
      return;
    }

    const region = getVideoRegionAtPoint(event.clientX, event.clientY, primary);

    if (region === "center") {
      clearPendingSingleClick();
      clearSeekClickSequence();
      nativeSideTap = null;
      return;
    }

    if (region !== "left" && region !== "right") {
      clearPendingSingleClick();
      clearSeekClickSequence();
      nativeSideTap = null;
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();

    const nativeToggled = snapshot?.media === primary && snapshot.paused !== primary.paused;

    if (seekClickSequence?.media === primary && seekClickSequence.region === region) {
      clearPendingSingleClick();
      if (nativeToggled) restoreClickPlayback(primary, snapshot.paused);
      seekBy(region);
      extendSeekClickSequence(primary, region);
      return;
    }

    clearSeekClickSequence();
    if (event.detail % 2 === 1) {
      clearPendingSingleClick();
      nativeSideTap = nativeToggled
        ? { media: primary, region, paused: snapshot.paused, at: performance.now() } : null;
      // Some players already toggle on the video before the event bubbles here.
      // Do not schedule a second toggle that would immediately undo it.
      if (nativeToggled) return;
      pendingSingleClickTimer = setTimeout(() => {
        pendingSingleClickTimer = null;
        if (primary.isConnected) togglePlayback(primary);
      }, SINGLE_CLICK_DELAY_MS);
      return;
    }

    clearPendingSingleClick();
    if (nativeSideTap?.media === primary && nativeSideTap.region === region &&
        performance.now() - nativeSideTap.at < SEEK_CLICK_SEQUENCE_MS) {
      restoreClickPlayback(primary, nativeSideTap.paused);
    } else if (nativeToggled) {
      restoreClickPlayback(primary, snapshot.paused);
    }
    nativeSideTap = null;
    nativePointerSequence = false;
    seekBy(region);
    extendSeekClickSequence(primary, region);
  }

  function onDoubleClick(event) {
    const primary = getPrimaryMedia();
    if (event.defaultPrevented || nativePointerSequence || event.button !== 0 || !isMediaSurfaceEvent(event, primary) || !settings.doubleClickEnabled) {
      clearPendingSingleClick();
      clearSeekClickSequence();
      return;
    }

    const region = getVideoRegionAtPoint(event.clientX, event.clientY, primary);
    if (region === "center") {
      clearSeekClickSequence();
      return;
    }

    if (region === "left" || region === "right") {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }

  function onContextMenu(event) {
    clearPendingSingleClick();
    clearSeekClickSequence();
    const primary = getPrimaryMedia();
    if (event.defaultPrevented || !settings.rightClickRewindEnabled || !isMediaSurfaceEvent(event, primary)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    seekBy("left");
  }

  function releaseIfFocusLost() {
    const wasActive = spaceHoldActivated || mouseHoldActivated;

    spaceDown = false;
    mouseDown = false;
    clearSpaceTimer();
    clearMouseTimer();
    clearPendingSingleClick();
    clearSeekClickSequence();
    nativeSideTap = null;
    nativePointerSequence = false;
    spaceHoldActivated = false;
    spaceTapCancelled = false;
    mouseHoldActivated = false;
    suppressNextClick = false;
    mouseHoldClickState = null;

    if (wasActive || originalRates.size) restoreTemporarySpeed();
  }

  function removeFallbackLauncher() {
    if (window.top !== window) return;
    document.getElementById(LAUNCHER_ID)?.remove();
  }

  function updateLauncherText() {
    if (window.top !== window) return;
    const button = document.getElementById(LAUNCHER_ID);
    if (!button) return;
    const label = i18n.t("launcherOpen");
    button.title = label;
    button.setAttribute("aria-label", label);
  }

  function ensureFallbackLauncher() {
    if (window.top !== window || !document.documentElement) return;
    if (document.getElementById(LAUNCHER_ID)) {
      updateLauncherText();
      return;
    }

    const button = document.createElement("button");
    button.id = LAUNCHER_ID;
    button.type = "button";

    const img = document.createElement("img");
    img.src = chrome.runtime.getURL("icon48.png");
    img.alt = "";

    Object.assign(img.style, {
      display: "block",
      width: "30px",
      height: "30px",
      borderRadius: "8px",
      pointerEvents: "none"
    });

    Object.assign(button.style, {
      position: "fixed",
      right: "18px",
      bottom: "86px",
      zIndex: "2147483645",
      width: "42px",
      height: "42px",
      display: "grid",
      placeItems: "center",
      padding: "0",
      border: "1px solid rgba(255,255,255,.20)",
      borderRadius: "12px",
      background: "rgba(12,18,27,.90)",
      boxShadow: "0 5px 18px rgba(0,0,0,.30)",
      cursor: "pointer",
      opacity: "0.88",
      backdropFilter: "blur(8px)",
      WebkitBackdropFilter: "blur(8px)"
    });

    button.appendChild(img);
    button.addEventListener("mouseenter", () => { button.style.opacity = "1"; });
    button.addEventListener("mouseleave", () => { button.style.opacity = "0.88"; });
    button.addEventListener("pointerdown", (event) => event.stopPropagation(), true);
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      chrome.runtime.sendMessage({ type: "wpt-open-popup" }, () => void chrome.runtime.lastError);
    }, true);

    (document.body || document.documentElement).appendChild(button);
    updateLauncherText();
  }

  function refreshFallbackLauncher() {
    if (window.top !== window) return;

    chrome.runtime.sendMessage({ type: "wpt-get-toolbar-state" }, (response) => {
      if (chrome.runtime.lastError) return;
      if (response?.ok && response.isOnToolbar === false) ensureFallbackLauncher();
      else removeFallbackLauncher();
    });
  }

  // Only the top frame owns the launcher; polling follows toolbar pin changes.
  function startFallbackLauncherWatcher() {
    if (window.top !== window) return;

    refreshFallbackLauncher();
    if (launcherCheckTimer !== null) clearInterval(launcherCheckTimer);
    launcherCheckTimer = setInterval(refreshFallbackLauncher, 4000);
  }

  function restoreClickPlayback(media, paused) {
    if (media.paused === paused) return;
    try {
      if (paused) media.pause();
      else media.play()?.catch?.(() => {});
    } catch (_) {}
  }

  // Native controls keep bubble priority. Known video surfaces get capture
  // priority below so Webex cannot consume seeking as fullscreen/context-menu UI.
  window.addEventListener("pointerdown", event => {
    nativePointerSequence = false;
    clearPendingSingleClick();
    if (isKnownVideoSurface(event, getPrimaryMedia())) {
      // As in the published extension, start video holds before Webex's tech
      // listener can stop propagation. This does not cancel the pointer event.
      onPointerDown(event);
      return;
    }
    queueMicrotask(() => {
      if (bubbledPointerDown.has(event)) return;
      nativePointerSequence = true;
      clearSeekClickSequence();
      nativeSideTap = null;
      finishMouseHold();
      suppressNextClick = false;
    });
  }, true);
  window.addEventListener("click", event => {
    const media = getPrimaryMedia();
    if (media) clickSnapshots.set(event, {
      media, paused: media.paused, rate: media.playbackRate, volume: media.volume, muted: media.muted
    });
  }, true);
  window.addEventListener("keydown", event => {
    const target = event.composedPath?.()[0] || event.target;
    const media = getPrimaryMedia();
    // Preserve the published shortcuts when the video has focus, before
    // Video.js consumes Space/J/K/L. Ambiguous shadow hosts use the fallback.
    if (target === document.body || target === document.documentElement ||
        (target === media && !media?.controls) ||
        (target instanceof Element && !target.shadowRoot && target.matches(VIDEO_SURFACE_SELECTOR))) {
      capturedVideoGestures.add(event);
      onKeyDown(event);
    }
  }, true);
  window.addEventListener("keydown", event => {
    if (!capturedVideoGestures.has(event)) onKeyDown(event);
  });
  window.addEventListener("keyup", onKeyUp, true);
  window.addEventListener("pointerdown", event => {
    if (!bubbledPointerDown.has(event)) onPointerDown(event);
  });
  window.addEventListener("pointerup", onPointerUp, true);
  window.addEventListener("pointercancel", onPointerCancel, true);
  for (const [type, handler] of [["click", onClick], ["dblclick", onDoubleClick], ["contextmenu", onContextMenu]]) {
    window.addEventListener(type, event => {
      if (!isKnownVideoSurface(event, getPrimaryMedia())) return;
      nativePointerSequence = false;
      capturedVideoGestures.add(event);
      handler(event);
    }, true);
    window.addEventListener(type, event => {
      if (!capturedVideoGestures.has(event)) handler(event);
    });
  }
  window.addEventListener("blur", releaseIfFocusLost, true);
  window.addEventListener("pagehide", () => {
    if (rateLabelFrame !== null) cancelAnimationFrame(rateLabelFrame);
    rateLabelFrame = null;
    rateLabelObserver?.disconnect();
    rateLabelObserver = null;
    rateLabelScope = null;
  });
  window.addEventListener("pageshow", scheduleNativeRateLabel);

  document.addEventListener("fullscreenchange", moveActiveOverlaysToCurrentHost, true);
  document.addEventListener("webkitfullscreenchange", moveActiveOverlaysToCurrentHost, true);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) releaseIfFocusLost();
    else refreshFallbackLauncher();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startFallbackLauncherWatcher, { once: true });
  } else {
    startFallbackLauncherWatcher();
  }
})();
