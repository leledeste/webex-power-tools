(() => {
  "use strict";

  // Shared validation keeps popup values and playback behavior consistent.
  const { DEFAULTS, clampSeek, clampVolumeStep, validRate } = globalThis.WPT_SETTINGS;

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
  }

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
    elements.fastRate.value = String(validRate(settings.fastRate));
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
        ? `Unable to save settings: ${chrome.runtime.lastError.message}`
        : i18n.t(messageKey, vars));
    });
  }

  chrome.storage.sync.get(DEFAULTS, raw => {
    const error = chrome.runtime.lastError;
    render(raw || DEFAULTS);
    if (error) showStatus(`Unable to load settings: ${error.message}`);
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
    savePartial({ fastRate: validRate(elements.fastRate.value) });
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
        showStatus(`Unable to restore defaults: ${chrome.runtime.lastError.message}`);
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
