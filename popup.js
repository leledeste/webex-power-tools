(() => {
  "use strict";

  // Shared validation keeps popup values and playback behavior consistent.
  const { DEFAULTS, clampSeek, clampVolumeStep, validRate, parsePlaybackRate } = globalThis.WPT_SETTINGS;

  const i18n = globalThis.WPT_I18N.createTranslator(DEFAULTS.language);

  const elements = {
    languagePicker: document.getElementById("languagePicker"),
    languageButton: document.getElementById("languagePickerButton"),
    languageMenu: document.getElementById("languageMenu"),
    languageSearch: document.getElementById("languageSearch"),
    languageList: document.getElementById("languageList"),
    languageNoResults: document.getElementById("languageNoResults"),
    currentLanguageFlag: document.getElementById("currentLanguageFlag"),
    currentLanguageName: document.getElementById("currentLanguageName"),
    currentLanguageHint: document.getElementById("currentLanguageHint"),

    rewind: document.getElementById("rewindSeconds"),
    forward: document.getElementById("forwardSeconds"),
    fastRate: document.getElementById("fastRate"),
    spaceHold: document.getElementById("spaceHoldEnabled"),
    mouseHold: document.getElementById("mouseHoldEnabled"),
    doubleClick: document.getElementById("doubleClickEnabled"),
    rightClick: document.getElementById("rightClickRewindEnabled"),
    volumeKeys: document.getElementById("volumeKeysEnabled"),
    volumeStep: document.getElementById("volumeStep"),
    jkl: document.getElementById("jklEnabled"),
    muteKey: document.getElementById("muteKeyEnabled"),
    overlays: document.getElementById("overlaysEnabled"),
    reset: document.getElementById("resetButton"),
    info: document.getElementById("infoButton"),
    infoPanel: document.getElementById("infoPanel"),
    status: document.getElementById("status")
  };

  // Read the displayed version from the manifest to avoid stale release labels.
  const version = chrome.runtime.getManifest().version.replace(/\.0$/, "");
  document.querySelectorAll("[data-extension-version]").forEach(node => {
    node.textContent = `v${version}`;
  });

  const presetButtons = [...document.querySelectorAll("[data-preset]")];
  let statusTimer = null;
  let currentLanguageSetting = DEFAULTS.language;
  const rateInput = document.getElementById("customPlaybackRate");
  const rateSelect = document.getElementById("permanentRate");
  const customSpeedForm = document.getElementById("customSpeedForm");
  const rateStatus = document.getElementById("customSpeedStatus");
  const applyRateButton = document.getElementById("applyCustomSpeed");
  const normalRateButton = document.getElementById("normalSpeed");
  let rateBusy = false;
  let rateEdited = false;
  let currentRate = null;
  let rateError = null;
  let rateRequestVersion = 0;
  let focusRateSelect = false;
  const holdEditor = document.getElementById("customHoldEditor");
  const holdInput = document.getElementById("customHoldRate");
  const holdButton = document.getElementById("applyCustomHold");
  const holdStatus = document.getElementById("customHoldStatus");
  let savedHoldRate = DEFAULTS.fastRate;
  let invalidHoldRate = false;

  // Use textContent for translated strings; translations never become HTML.
  function applyTranslations() {
    document.documentElement.lang = i18n.language;
    document.documentElement.dir = i18n.direction;

    document.querySelectorAll("[data-i18n]").forEach((node) => {
      node.textContent = i18n.t(node.dataset.i18n);
    });

    document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
      node.placeholder = i18n.t(node.dataset.i18nPlaceholder);
    });

    elements.languageSearch.setAttribute("aria-label", i18n.t("languageSearchLabel"));
    renderRateStatus();
    if (invalidHoldRate) holdStatus.textContent = i18n.t("rateInvalid");
  }

  function selectHoldRate(rate) {
    holdInput.value = rate;
    elements.fastRate.value = globalThis.WPT_SETTINGS.RATES.includes(rate) ? String(rate) : "custom";
    holdEditor.hidden = elements.fastRate.value !== "custom";
  }

  function saveHoldRate(value) {
    const rate = parsePlaybackRate(value);
    if (rate === null) {
      invalidHoldRate = true;
      holdInput.setAttribute("aria-invalid", "true");
      holdStatus.textContent = i18n.t("rateInvalid");
      return;
    }
    invalidHoldRate = false;
    holdInput.removeAttribute("aria-invalid");
    holdStatus.textContent = "";
    elements.fastRate.disabled = holdInput.disabled = holdButton.disabled = true;
    chrome.storage.sync.set({ fastRate: rate }, () => {
      const error = chrome.runtime.lastError;
      const focusSelect = holdEditor.contains(document.activeElement);
      if (!error) savedHoldRate = rate;
      selectHoldRate(savedHoldRate);
      elements.fastRate.disabled = holdInput.disabled = holdButton.disabled = false;
      if (focusSelect && holdEditor.hidden) elements.fastRate.focus();
      showStatus(error ? i18n.t("saveFailed", { error: error.message }) : i18n.t("saved"));
    });
  }

  document.getElementById("customHoldForm").addEventListener("submit", event => {
    event.preventDefault();
    saveHoldRate(holdInput.value);
  });
  holdInput.addEventListener("input", () => {
    invalidHoldRate = false;
    holdInput.removeAttribute("aria-invalid");
    holdStatus.textContent = "";
  });

  function renderRateStatus() {
    rateStatus.textContent = rateError ? i18n.t(rateError)
      : currentRate === null ? "" : i18n.t("customSpeedCurrent", { value: currentRate });
  }

  function selectPlaybackRate(rate) {
    // Keep the same presets as the hold-speed menu; intermediate rates use Custom.
    const value = String(rate);
    rateSelect.value = [...rateSelect.options].some(option => option.value === value) ? value : "custom";
    customSpeedForm.hidden = rateSelect.value !== "custom";
    if (customSpeedForm.hidden && customSpeedForm.contains(document.activeElement)) {
      if (rateBusy) focusRateSelect = true;
      else rateSelect.focus();
    }
  }

  function requestPlaybackRate(action, value) {
    return new Promise(resolve => {
      chrome.runtime.sendMessage({ type: "wpt-playback-rate", action, value }, response => {
        const error = chrome.runtime.lastError;
        resolve(error ? { ok: false, error: "no-recording" } : response || { ok: false });
      });
    });
  }

  async function readPlaybackRate() {
    if (rateBusy || !rateInput.isConnected) return;
    const requestVersion = ++rateRequestVersion;
    const response = await requestPlaybackRate("get");
    if (requestVersion !== rateRequestVersion || rateBusy || rateEdited || !rateInput.isConnected) return;
    currentRate = response.ok && Number.isFinite(response.rate) ? response.rate : null;
    rateError = currentRate === null ? "rateUnavailable" : null;
    if (currentRate !== null) {
      rateInput.value = currentRate;
      selectPlaybackRate(currentRate);
    }
    renderRateStatus();
  }

  async function applyPlaybackRate(value) {
    if (rateBusy) return;
    const rate = parsePlaybackRate(value);
    if (rate === null) {
      rateInput.setAttribute("aria-invalid", "true");
      rateError = "rateInvalid";
      renderRateStatus();
      return;
    }
    rateBusy = true;
    rateInput.removeAttribute("aria-invalid");
    rateRequestVersion++;
    rateSelect.disabled = rateInput.disabled = applyRateButton.disabled = normalRateButton.disabled = true;
    try {
      const response = await requestPlaybackRate("set", rate);
      if (!response.ok) {
        rateError = response.error === "invalid-rate" ? "rateInvalid" : "rateUnavailable";
        if (rateSelect.value !== "custom") selectPlaybackRate(currentRate ?? rateInput.value);
      } else {
        currentRate = response.rate;
        rateInput.value = rate;
        selectPlaybackRate(rate);
        rateEdited = false;
        rateError = null;
        // Save only the reusable input value, never recording state or its URL.
        savePartial({ customPlaybackRate: rate });
      }
      renderRateStatus();
    } finally {
      rateBusy = false;
      rateSelect.disabled = rateInput.disabled = applyRateButton.disabled = normalRateButton.disabled = false;
      if (focusRateSelect) {
        focusRateSelect = false;
        rateSelect.focus();
      }
    }
  }

  rateInput.addEventListener("input", () => { rateEdited = true; rateInput.removeAttribute("aria-invalid"); });
  rateSelect.addEventListener("change", () => {
    if (rateSelect.value === "custom") {
      rateEdited = true;
      rateRequestVersion++;
      customSpeedForm.hidden = false;
      rateInput.focus();
    } else {
      customSpeedForm.hidden = true;
      applyPlaybackRate(rateSelect.value);
    }
  });
  customSpeedForm.addEventListener("submit", event => {
    event.preventDefault();
    applyPlaybackRate(rateInput.value);
  });
  normalRateButton.addEventListener("click", () => applyPlaybackRate(1));
  window.addEventListener("focus", readPlaybackRate);

  function showStatus(message) {
    if (statusTimer !== null) clearTimeout(statusTimer);
    elements.status.textContent = message;
    statusTimer = setTimeout(() => {
      statusTimer = null;
      elements.status.textContent = "";
    }, 1400);
  }

  function updatePresetHighlight() {
    const rewind = Number(elements.rewind.value);
    const forward = Number(elements.forward.value);

    presetButtons.forEach((button) => {
      const preset = Number(button.dataset.preset);
      button.classList.toggle("active", rewind === preset && forward === preset);
    });
  }

  function getDetectedMeta() {
    const detected = globalThis.WPT_I18N.resolveLanguage("auto");
    return globalThis.WPT_I18N.getLanguageMeta(detected);
  }

  function renderCurrentLanguage() {
    if (currentLanguageSetting === "auto") {
      const detected = getDetectedMeta();
      elements.currentLanguageFlag.src = "flags/auto.svg";
      elements.currentLanguageFlag.alt = "";
      elements.currentLanguageName.textContent = i18n.t("languageAuto");
      elements.currentLanguageHint.textContent = i18n.t("languageAutoHint", {
        language: detected.nativeName
      });
      return;
    }

    const meta = globalThis.WPT_I18N.getLanguageMeta(currentLanguageSetting);
    elements.currentLanguageFlag.src = meta.flagAsset;
    elements.currentLanguageFlag.alt = "";
    elements.currentLanguageName.textContent = meta.nativeName;
    elements.currentLanguageHint.textContent =
      meta.nativeName === meta.englishName ? meta.code : meta.englishName;
  }

  function languageMatches(entry, query) {
    const q = globalThis.WPT_I18N.normalizeSearch(query);
    if (!q) return true;
    return globalThis.WPT_I18N.languageSearchText(entry).includes(q);
  }

  function makeLanguageOption({ code, flagAsset, nativeName, englishName }) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "language-option";
    button.setAttribute("role", "option");

    const selected = currentLanguageSetting === code;
    button.setAttribute("aria-selected", selected ? "true" : "false");
    button.dataset.language = code;

    const flagImage = document.createElement("img");
    flagImage.className = "flag-img";
    flagImage.src = flagAsset;
    flagImage.alt = "";

    const names = document.createElement("span");
    names.className = "names";

    const strong = document.createElement("strong");
    strong.textContent = nativeName;

    const small = document.createElement("small");
    small.textContent = englishName;

    names.append(strong, small);

    const check = document.createElement("span");
    check.className = "check";
    check.textContent = selected ? "✓" : "";

    button.append(flagImage, names, check);

    button.addEventListener("click", () => {
      selectLanguage(code);
      closeLanguageMenu();
      elements.languageButton.focus();
    });

    return button;
  }

  // Match native names, English names, language codes and search aliases.
  function renderLanguageList(query = "") {
    elements.languageList.replaceChildren();

    let count = 0;
    const normalizedQuery = globalThis.WPT_I18N.normalizeSearch(query);
    const detected = getDetectedMeta();

    const autoSearchText = globalThis.WPT_I18N.normalizeSearch([
      "auto",
      "automatic",
      "browser",
      i18n.t("languageAuto"),
      detected.nativeName,
      detected.englishName
    ].join(" "));

    if (!normalizedQuery || autoSearchText.includes(normalizedQuery)) {
      elements.languageList.appendChild(
        makeLanguageOption({
          code: "auto",
          flagAsset: "flags/auto.svg",
          nativeName: i18n.t("languageAuto"),
          englishName: i18n.t("languageAutoHint", { language: detected.nativeName })
        })
      );
      count += 1;
    }

    for (const entry of globalThis.WPT_I18N.languages) {
      if (!languageMatches(entry, query)) continue;
      elements.languageList.appendChild(
        makeLanguageOption({
          code: entry.code,
          flagAsset: entry.flagAsset,
          nativeName: entry.nativeName,
          englishName: entry.englishName
        })
      );
      count += 1;
    }

    elements.languageNoResults.hidden = count !== 0;
  }

  function openLanguageMenu() {
    elements.languageMenu.hidden = false;
    elements.languageButton.setAttribute("aria-expanded", "true");
    elements.languageSearch.value = "";
    renderLanguageList("");
    requestAnimationFrame(() => elements.languageSearch.focus());
  }

  function closeLanguageMenu() {
    elements.languageMenu.hidden = true;
    elements.languageButton.setAttribute("aria-expanded", "false");
    elements.languageSearch.value = "";
  }

  function selectLanguage(language) {
    currentLanguageSetting = language;
    i18n.setLanguage(language);
    applyTranslations();
    renderCurrentLanguage();
    renderLanguageList(elements.languageSearch.value);
    savePartial({ language });
  }

  // Normalize old or manually edited storage before showing settings.
  function render(raw) {
    const settings = globalThis.WPT_SETTINGS.normalize(raw);
    currentLanguageSetting =
      typeof settings.language === "string" ? settings.language : DEFAULTS.language;

    i18n.setLanguage(currentLanguageSetting);
    applyTranslations();
    renderCurrentLanguage();

    elements.rewind.value = clampSeek(settings.rewindSeconds, DEFAULTS.rewindSeconds);
    elements.forward.value = clampSeek(settings.forwardSeconds, DEFAULTS.forwardSeconds);
    savedHoldRate = validRate(settings.fastRate);
    selectHoldRate(savedHoldRate);
    invalidHoldRate = false;
    holdInput.removeAttribute("aria-invalid");
    holdStatus.textContent = "";
    rateInput.value = currentRate ?? settings.customPlaybackRate;
    selectPlaybackRate(rateInput.value);
    elements.spaceHold.checked = settings.spaceHoldEnabled !== false;
    elements.mouseHold.checked = settings.mouseHoldEnabled !== false;
    elements.doubleClick.checked = settings.doubleClickEnabled !== false;
    elements.rightClick.checked = settings.rightClickRewindEnabled !== false;
    elements.volumeKeys.checked = settings.volumeKeysEnabled !== false;
    elements.volumeStep.value = clampVolumeStep(settings.volumeStep, DEFAULTS.volumeStep);
    elements.jkl.checked = settings.jklEnabled !== false;
    elements.muteKey.checked = settings.muteKeyEnabled !== false;
    elements.overlays.checked = settings.overlaysEnabled !== false;

    updatePresetHighlight();
    renderLanguageList("");
  }

  // Each control writes only its own key, preserving changes from other popups.
  function savePartial(partial, messageKey = "saved", vars = {}) {
    chrome.storage.sync.set(partial, () => {
      showStatus(chrome.runtime.lastError
        ? i18n.t("saveFailed", { error: chrome.runtime.lastError.message })
        : i18n.t(messageKey, vars));
    });
  }

  chrome.storage.sync.get(DEFAULTS, raw => {
    const error = chrome.runtime.lastError;
    render(raw || DEFAULTS);
    if (error) showStatus(i18n.t("loadFailed", { error: error.message }));
    readPlaybackRate();
  });

  elements.languageButton.addEventListener("click", () => {
    if (elements.languageMenu.hidden) openLanguageMenu();
    else closeLanguageMenu();
  });

  elements.languageSearch.addEventListener("input", () => {
    renderLanguageList(elements.languageSearch.value);
  });

  document.addEventListener("pointerdown", (event) => {
    if (!elements.languageMenu.hidden && !elements.languagePicker.contains(event.target)) {
      closeLanguageMenu();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !elements.languageMenu.hidden) {
      closeLanguageMenu();
      elements.languageButton.focus();
    }
  });

  elements.rewind.addEventListener("change", () => {
    const value = clampSeek(elements.rewind.value, DEFAULTS.rewindSeconds);
    elements.rewind.value = value;
    savePartial({ rewindSeconds: value });
    updatePresetHighlight();
  });

  elements.forward.addEventListener("change", () => {
    const value = clampSeek(elements.forward.value, DEFAULTS.forwardSeconds);
    elements.forward.value = value;
    savePartial({ forwardSeconds: value });
    updatePresetHighlight();
  });

  elements.fastRate.addEventListener("change", () => {
    if (elements.fastRate.value === "custom") {
      holdEditor.hidden = false;
      holdInput.focus();
    } else {
      saveHoldRate(elements.fastRate.value);
    }
  });

  elements.spaceHold.addEventListener("change", () =>
    savePartial({ spaceHoldEnabled: elements.spaceHold.checked })
  );
  elements.mouseHold.addEventListener("change", () =>
    savePartial({ mouseHoldEnabled: elements.mouseHold.checked })
  );
  elements.doubleClick.addEventListener("change", () =>
    savePartial({ doubleClickEnabled: elements.doubleClick.checked })
  );
  elements.rightClick.addEventListener("change", () =>
    savePartial({ rightClickRewindEnabled: elements.rightClick.checked })
  );
  elements.volumeKeys.addEventListener("change", () =>
    savePartial({ volumeKeysEnabled: elements.volumeKeys.checked })
  );
  elements.jkl.addEventListener("change", () =>
    savePartial({ jklEnabled: elements.jkl.checked })
  );
  elements.muteKey.addEventListener("change", () =>
    savePartial({ muteKeyEnabled: elements.muteKey.checked })
  );
  elements.overlays.addEventListener("change", () =>
    savePartial({ overlaysEnabled: elements.overlays.checked })
  );

  elements.volumeStep.addEventListener("change", () => {
    const value = clampVolumeStep(elements.volumeStep.value, DEFAULTS.volumeStep);
    elements.volumeStep.value = value;
    savePartial({ volumeStep: value });
  });

  presetButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const value = clampSeek(button.dataset.preset, 5);
      elements.rewind.value = value;
      elements.forward.value = value;
      updatePresetHighlight();
      savePartial(
        { rewindSeconds: value, forwardSeconds: value },
        "presetApplied",
        { value }
      );
    });
  });

  elements.reset.addEventListener("click", () => {
    chrome.storage.sync.set(DEFAULTS, () => {
      if (chrome.runtime.lastError) {
        showStatus(i18n.t("resetFailed", { error: chrome.runtime.lastError.message }));
        return;
      }
      render(DEFAULTS);
      showStatus(i18n.t("defaultsRestored"));
    });
  });

  elements.info.addEventListener("click", () => {
    elements.infoPanel.hidden = !elements.infoPanel.hidden;
    elements.info.setAttribute("aria-expanded", String(!elements.infoPanel.hidden));
  });
})();
