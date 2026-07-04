// Runs in the page's isolated world (shares the DOM, not the page's JS
// globals). Everything is mounted inside a single Shadow DOM host so the
// overlay/review UI can never be affected by — or clash with — the host
// page's own CSS.

(function bxInit() {
  window.__bxExtensionLoaded = true;
  window.__bxStartCapture = bxStartCapture;

  const EXTRACT_URL = "https://bixt.vercel.app/api/extract";

  let bxHost = null;
  let bxShadow = null;

  function bxMount() {
    bxHost = document.createElement("div");
    bxHost.style.cssText = "all: initial; position: fixed; inset: 0; z-index: 2147483647;";
    document.documentElement.appendChild(bxHost);
    bxShadow = bxHost.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = `
      * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
      .bx-dim { position: fixed; inset: 0; background: rgba(8,11,9,0.35); cursor: crosshair; }
      .bx-hint { position: fixed; top: 20px; left: 50%; transform: translateX(-50%); background: #1a2420; color: #fff; font-size: 13px; padding: 8px 16px; border-radius: 8px; border: 1px solid #2a3830; }
      .bx-rect { position: fixed; border: 2px solid #22c55e; background: rgba(34,197,94,0.12); }
      .bx-card { position: fixed; top: 20px; right: 20px; width: 300px; background: #1a2420; border: 1px solid #2a3830; border-radius: 14px; padding: 18px; color: #fff; box-shadow: 0 8px 24px rgba(0,0,0,0.4); }
      .bx-card h3 { margin: 0 0 10px; font-size: 14px; font-weight: 600; }
      .bx-card label { display: block; font-size: 11px; color: #6b7d72; text-transform: uppercase; letter-spacing: 0.03em; margin: 10px 0 4px; }
      .bx-card input { width: 100%; padding: 9px 10px; border-radius: 8px; border: 1px solid #2a3830; background: #080b09; color: #fff; font-size: 14px; }
      .bx-row { display: flex; gap: 8px; margin-top: 14px; }
      .bx-btn { flex: 1; padding: 10px; border-radius: 8px; border: none; font-size: 13px; font-weight: 600; cursor: pointer; }
      .bx-btn-primary { background: #22c55e; color: #080b09; }
      .bx-btn-secondary { background: #0f1410; color: #fff; border: 1px solid #2a3830; }
      .bx-status { font-size: 13px; color: #6b7d72; margin-top: 10px; }
      .bx-error { font-size: 13px; color: #ff4d4d; margin-top: 10px; }
    `;
    bxShadow.appendChild(style);
  }

  function bxUnmount() {
    if (bxHost) bxHost.remove();
    bxHost = null;
    bxShadow = null;
  }

  function bxSetBody(html) {
    if (!bxShadow) return;
    const wrapper = document.createElement("div");
    wrapper.innerHTML = html;
    const existing = bxShadow.querySelector(".bx-root");
    if (existing) existing.remove();
    const root = document.createElement("div");
    root.className = "bx-root";
    while (wrapper.firstChild) root.appendChild(wrapper.firstChild);
    bxShadow.appendChild(root);
    return root;
  }

  function bxSendMessage(message) {
    return new Promise((resolve) => chrome.runtime.sendMessage(message, resolve));
  }

  function bxFormatFilename(dateStr, place) {
    const parsed = dateStr ? new Date(`${dateStr}T00:00:00`) : null;
    const d = parsed && !isNaN(parsed.getTime()) ? parsed : new Date();
    const day = String(d.getDate()).padStart(2, "0");
    const month = d.toLocaleString("en-US", { month: "long" }).toLowerCase();
    const merchant = (place || "").trim().replace(/[\\/:*?"<>|]/g, "").trim();
    return `${day} ${month} ${d.getFullYear()} ${merchant || "Untitled"}.jpg`;
  }

  async function bxStartCapture() {
    if (bxHost) return; // already capturing

    const { bxRootFolderId, bxCompanyName } = await chrome.storage.local.get(["bxRootFolderId", "bxCompanyName"]);
    if (!bxRootFolderId) {
      bxMount();
      bxSetBody(`
        <div class="bx-card">
          <h3>BX not connected</h3>
          <p class="bx-status">Click the BX icon in your toolbar and connect Google Drive first.</p>
          <div class="bx-row"><button class="bx-btn bx-btn-secondary" id="bx-close">Close</button></div>
        </div>
      `);
      bxShadow.getElementById("bx-close").onclick = bxUnmount;
      return;
    }

    bxMount();
    bxSetBody(`<div class="bx-dim"></div><div class="bx-hint">Drag to select the receipt · Esc to cancel</div>`);
    const dim = bxShadow.querySelector(".bx-dim");

    let startX = 0, startY = 0, rectEl = null;

    function onKeydown(e) {
      if (e.key === "Escape") cleanupAndClose();
    }

    function cleanupAndClose() {
      document.removeEventListener("keydown", onKeydown);
      bxUnmount();
    }

    document.addEventListener("keydown", onKeydown);

    dim.addEventListener("mousedown", (e) => {
      startX = e.clientX;
      startY = e.clientY;
      rectEl = document.createElement("div");
      rectEl.className = "bx-rect";
      bxShadow.appendChild(rectEl);

      function onMove(e2) {
        const x = Math.min(startX, e2.clientX);
        const y = Math.min(startY, e2.clientY);
        const w = Math.abs(e2.clientX - startX);
        const h = Math.abs(e2.clientY - startY);
        rectEl.style.left = `${x}px`;
        rectEl.style.top = `${y}px`;
        rectEl.style.width = `${w}px`;
        rectEl.style.height = `${h}px`;
      }

      function onUp(e3) {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        const x = Math.min(startX, e3.clientX);
        const y = Math.min(startY, e3.clientY);
        const w = Math.abs(e3.clientX - startX);
        const h = Math.abs(e3.clientY - startY);
        document.removeEventListener("keydown", onKeydown);
        if (w < 10 || h < 10) {
          bxUnmount();
          return;
        }
        bxHandleSelection({ x, y, w, h }, bxRootFolderId, bxCompanyName);
      }

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  }

  async function bxHandleSelection(rect, rootFolderId, companyName) {
    bxSetBody(`<div class="bx-card"><h3>BX</h3><p class="bx-status">Reading receipt…</p></div>`);

    try {
      const capture = await bxSendMessage({ type: "BX_CAPTURE_VISIBLE_TAB" });
      if (capture.error) throw new Error(capture.error);

      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = capture.dataUrl;
      });

      const ratio = img.width / window.innerWidth;
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(rect.w * ratio);
      canvas.height = Math.round(rect.h * ratio);
      canvas.getContext("2d").drawImage(
        img,
        rect.x * ratio, rect.y * ratio, rect.w * ratio, rect.h * ratio,
        0, 0, canvas.width, canvas.height
      );

      const { base64, mimeType } = await bxCompressCanvas(canvas);

      const res = await fetch(EXTRACT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mediaType: mimeType }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Extraction failed");

      bxShowReview(data.result || {}, base64, mimeType, rootFolderId, companyName);
    } catch (err) {
      bxSetBody(`
        <div class="bx-card">
          <h3>BX</h3>
          <p class="bx-error">${err.message}</p>
          <div class="bx-row"><button class="bx-btn bx-btn-secondary" id="bx-close">Close</button></div>
        </div>
      `);
      bxShadow.getElementById("bx-close").onclick = bxUnmount;
    }
  }

  function bxShowReview(result, base64, mimeType, rootFolderId, companyName) {
    const root = bxSetBody(`
      <div class="bx-card">
        <h3>${companyName || "BX"}</h3>
        <label>Place</label>
        <input id="bx-place" value="${(result.place || "").replace(/"/g, "&quot;")}" />
        <label>Total</label>
        <input id="bx-total" value="${(result.total || "").replace(/"/g, "&quot;")}" />
        <label>HST / Tax</label>
        <input id="bx-hst" value="${(result.hst || "").replace(/"/g, "&quot;")}" />
        <label>Date</label>
        <input id="bx-date" value="${(result.date || "").replace(/"/g, "&quot;")}" placeholder="YYYY-MM-DD" />
        <div class="bx-row">
          <button class="bx-btn bx-btn-secondary" id="bx-cancel">Cancel</button>
          <button class="bx-btn bx-btn-primary" id="bx-confirm">✓ Save</button>
        </div>
        <div id="bx-msg"></div>
      </div>
    `);

    root.querySelector("#bx-cancel").onclick = bxUnmount;
    root.querySelector("#bx-confirm").onclick = async () => {
      const place = root.querySelector("#bx-place").value;
      const total = root.querySelector("#bx-total").value;
      const hst = root.querySelector("#bx-hst").value;
      const date = root.querySelector("#bx-date").value;
      const msg = root.querySelector("#bx-msg");
      msg.className = "bx-status";
      msg.textContent = "Saving to Google Drive…";

      try {
        const tokenResp = await bxSendMessage({ type: "BX_GET_AUTH_TOKEN" });
        if (tokenResp.error) throw new Error(tokenResp.error);

        await bxSaveExpenseToDrive(tokenResp.token, {
          rootId: rootFolderId,
          imageBase64: base64,
          mimeType,
          filename: bxFormatFilename(date, place),
          place, total, hst, date,
        });

        msg.className = "bx-status";
        msg.textContent = "Saved ✓";
        setTimeout(bxUnmount, 1200);
      } catch (err) {
        msg.className = "bx-error";
        msg.textContent = err.message;
      }
    };
  }
})();
