// Injects the capture overlay on demand (keyboard shortcut or the popup's
// "Capture Now" button) and relays chrome.tabs.captureVisibleTab(), which
// only the background/service-worker context can call — content scripts
// can't call it directly.

async function bxTriggerCapture(tabId) {
  // Re-injecting the same files a second time on an already-loaded page
  // would throw "already declared" errors (isolated world persists across
  // triggers until the page navigates), so check first and just re-invoke
  // the existing capture function instead of re-injecting.
  const [{ result: alreadyLoaded }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => !!window.__bxExtensionLoaded,
  });

  if (alreadyLoaded) {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => window.__bxStartCapture && window.__bxStartCapture(),
    });
  } else {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["image.js", "drive.js", "content-script.js"],
    });
  }
}

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "capture-receipt" && tab?.id) {
    bxTriggerCapture(tab.id);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "BX_START_CAPTURE_ON_ACTIVE_TAB") {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (tab?.id) bxTriggerCapture(tab.id);
    });
    return false;
  }

  if (message.type === "BX_CAPTURE_VISIBLE_TAB") {
    const windowId = sender.tab?.windowId;
    chrome.tabs.captureVisibleTab(windowId, { format: "png" }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ dataUrl });
      }
    });
    return true; // keep the message channel open for the async sendResponse
  }

  // chrome.identity is only available to extension pages (background,
  // popup) — content scripts run in the page's context and can't call it
  // directly, so this relays a silent (non-interactive) token fetch. If
  // silent fails, the user needs to reopen the popup and reconnect —
  // deliberately not popping an interactive OAuth prompt over a random
  // webpage.
  if (message.type === "BX_GET_AUTH_TOKEN") {
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
      if (chrome.runtime.lastError || !token) {
        sendResponse({ error: "Not connected — open the BX extension icon and reconnect Google Drive." });
      } else {
        sendResponse({ token });
      }
    });
    return true;
  }
});
