"use strict";

// Enable the toolbar action only on HTTPS Webex hosts, including the root host.
function installWebexActionRule() {
  chrome.action.disable();

  chrome.declarativeContent.onPageChanged.removeRules(undefined, () => {
    const webexRule = {
      conditions: [
        new chrome.declarativeContent.PageStateMatcher({
          pageUrl: {
            hostSuffix: ".webex.com",
            schemes: ["https"]
          }
        }),
        new chrome.declarativeContent.PageStateMatcher({
          pageUrl: { hostEquals: "webex.com", schemes: ["https"] }
        })
      ],
      actions: [
        new chrome.declarativeContent.ShowAction()
      ]
    };

    chrome.declarativeContent.onPageChanged.addRules([webexRule]);
  });
}

chrome.runtime.onInstalled.addListener(() => {
  installWebexActionRule();
});

chrome.runtime.onStartup.addListener(() => {
  installWebexActionRule();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Returning true keeps the response channel open for the asynchronous action APIs.
  if (!message || typeof message !== "object") return;

  if (message.type === "wpt-playback-rate" && ["get", "set"].includes(message.action)) {
    // Target the active tab only; normal tab queries need no additional permission.
    // Each matching frame controls its own primary/synchronized media group.
    chrome.tabs.query({ active: true, currentWindow: true })
      .then(([tab]) => {
        if (tab?.id == null) throw new Error("No active tab");
        return chrome.tabs.sendMessage(tab.id, {
          type: "wpt-media-rate", action: message.action, value: message.value
        });
      })
      .then(response => sendResponse(response || { ok: false, error: "no-recording" }))
      .catch(() => sendResponse({ ok: false, error: "no-recording" }));
    return true;
  }

  if (message.type === "wpt-get-toolbar-state") {
    chrome.action.getUserSettings()
      .then((settings) => {
        sendResponse({
          ok: true,
          isOnToolbar: Boolean(settings?.isOnToolbar)
        });
      })
      .catch(() => {
        sendResponse({
          ok: false,
          isOnToolbar: true
        });
      });

    return true;
  }

  if (message.type === "wpt-open-popup") {
    const options =
      sender?.tab?.windowId != null
        ? { windowId: sender.tab.windowId }
        : undefined;

    chrome.action.openPopup(options)
      .then(() => {
        sendResponse({ ok: true });
      })
      .catch((error) => {
        sendResponse({
          ok: false,
          error: String(error?.message || error || "Unable to open popup")
        });
      });

    return true;
  }
});
