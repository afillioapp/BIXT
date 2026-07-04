// Runs as the extension's popup page — chrome.identity is directly
// available here (unlike in content scripts), so the connect flow lives
// entirely in the popup.

const STATES = ["bxp-loading", "bxp-connect", "bxp-setup", "bxp-connected"];

function show(id) {
  STATES.forEach((s) => document.getElementById(s).classList.toggle("bxp-hidden", s !== id));
}

function showConnected(companyName) {
  document.getElementById("bxp-company-name").textContent = companyName || "BX";
  show("bxp-connected");
}

function getAuthTokenInteractive() {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError || !token) {
        reject(new Error(chrome.runtime.lastError?.message || "Could not connect to Google"));
      } else {
        resolve(token);
      }
    });
  });
}

async function handleConnect() {
  const errEl = document.getElementById("bxp-connect-error");
  errEl.textContent = "";
  try {
    const token = await getAuthTokenInteractive();
    const rootId = await bxFindExistingCompanyRootFolder(token);
    if (rootId) {
      const profile = await bxGetProfile(token, rootId);
      await chrome.storage.local.set({
        bxRootFolderId: rootId,
        bxCompanyName: profile?.companyName || "",
        bxAccountantEmail: profile?.accountantEmail || "",
      });
      showConnected(profile?.companyName);
    } else {
      show("bxp-setup");
    }
  } catch (err) {
    errEl.textContent = err.message;
  }
}

async function handleSetup() {
  const company = document.getElementById("bxp-company").value.trim();
  const accountant = document.getElementById("bxp-accountant").value.trim();
  const errEl = document.getElementById("bxp-setup-error");
  errEl.textContent = "";
  if (!company || !accountant) return;

  try {
    const token = await getAuthTokenInteractive(); // still cached from the connect step
    const rootId = await bxGetCompanyRootFolderId(token, company);
    await bxShareWithEmail(token, rootId, accountant, "reader");
    await bxSaveProfile(token, rootId, { companyName: company, accountantEmail: accountant });
    await bxEnsureMonthFolders(token, rootId, new Date());
    await chrome.storage.local.set({ bxRootFolderId: rootId, bxCompanyName: company, bxAccountantEmail: accountant });
    showConnected(company);
  } catch (err) {
    errEl.textContent = err.message;
  }
}

function handleCapture() {
  chrome.runtime.sendMessage({ type: "BX_START_CAPTURE_ON_ACTIVE_TAB" });
  window.close();
}

async function handleDisconnect() {
  chrome.identity.getAuthToken({ interactive: false }, (token) => {
    if (token) {
      chrome.identity.removeCachedAuthToken({ token }, () => {
        fetch(`https://accounts.google.com/o/oauth2/revoke?token=${token}`).catch(() => {});
      });
    }
  });
  await chrome.storage.local.remove(["bxRootFolderId", "bxCompanyName", "bxAccountantEmail"]);
  show("bxp-connect");
}

async function init() {
  document.getElementById("bxp-connect-btn").addEventListener("click", handleConnect);
  document.getElementById("bxp-setup-btn").addEventListener("click", handleSetup);
  document.getElementById("bxp-capture-btn").addEventListener("click", handleCapture);
  document.getElementById("bxp-disconnect-btn").addEventListener("click", handleDisconnect);

  const { bxRootFolderId, bxCompanyName } = await chrome.storage.local.get(["bxRootFolderId", "bxCompanyName"]);
  if (bxRootFolderId) {
    showConnected(bxCompanyName);
  } else {
    show("bxp-connect");
  }
}

init();
