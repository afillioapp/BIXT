import { useState, useRef } from "react";
import Script from "next/script";
import {
  signOut,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from "firebase/auth";
import { auth } from "../lib/firebase";
import {
  saveExpenseToDrive,
  getRootFolderId,
  shareWithEmail,
  listSharedEmails,
  removeSharedEmail,
  getProfile,
  saveProfile,
  ensureCompanyMonthFolders,
} from "../lib/google";

const SCOPES =
  "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets";
const SHEET_HEADER = [
  "Date", "Place", "Total", "HST/Tax", "Currency", "Category", "Notes", "Receipt Link",
];

const EXT_BY_MIME = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic" };

// "04 july 2026 Dollarama.jpg" — falls back to "Untitled" if the merchant name wasn't read.
function formatReceiptFilename(dateStr, place, mimeType) {
  const parsed = dateStr ? new Date(`${dateStr}T00:00:00`) : null;
  const d = parsed && !isNaN(parsed.getTime()) ? parsed : new Date();
  const day = String(d.getDate()).padStart(2, "0");
  const month = d.toLocaleString("en-US", { month: "long" }).toLowerCase();
  const merchant = (place || "").trim().replace(/[\\/:*?"<>|]/g, "").trim();
  const ext = EXT_BY_MIME[mimeType] || "jpg";
  return `${day} ${month} ${d.getFullYear()} ${merchant || "Untitled"}.${ext}`;
}

export default function Home({ user }) {
  const [gsiReady, setGsiReady]     = useState(false);
  const [tokenClient, setTokenClient] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [rootFolderId, setRootFolderId] = useState(null);

  // Onboarding
  const [profile, setProfile]         = useState(null); // null until loaded/created
  const [profileChecked, setProfileChecked] = useState(false);
  const [onboardCompany, setOnboardCompany]       = useState("");
  const [onboardAccountant, setOnboardAccountant] = useState("");
  const [onboarding, setOnboarding] = useState(false);
  const [onboardError, setOnboardError] = useState("");

  const [imagePreview, setImagePreview] = useState(null);
  const [imageBase64, setImageBase64]   = useState(null);
  const [mimeType, setMimeType]         = useState(null);

  const [form, setForm]           = useState(null);
  const [categories, setCategories] = useState([]);
  const [status, setStatus]       = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving]       = useState(false);

  // Accountant sharing
  const [showShare, setShowShare]         = useState(false);
  const [accountantEmail, setAccountantEmail] = useState("");
  const [sharedList, setSharedList]       = useState(null);
  const [shareStatus, setShareStatus]     = useState(null);
  const [shareLoading, setShareLoading]   = useState(false);

  // Change password
  const [showPassword, setShowPassword]       = useState(false);
  const [currentPassword, setCurrentPassword]  = useState("");
  const [newPassword, setNewPassword]          = useState("");
  const [confirmPassword, setConfirmPassword]  = useState("");
  const [passwordStatus, setPasswordStatus]    = useState(null);
  const [passwordLoading, setPasswordLoading]  = useState(false);
  const hasPasswordProvider = user?.providerData?.some((p) => p.providerId === "password");

  const fileInputRef = useRef(null);

  // ── Google Drive auth ─────────────────────────────────────────────────────
  function handleGsiLoad() {
    setGsiReady(true);
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
      scope: SCOPES,
      callback: async (resp) => {
        if (resp.access_token) {
          setAccessToken(resp.access_token);
          setStatus({ type: "success", text: "Connected to Google Drive" });
          // Pre-create the BIXT root folder so sharing works even before first receipt
          const id = await getRootFolderId(resp.access_token);
          setRootFolderId(id);
          const existing = await getProfile(resp.access_token, id);
          setProfile(existing);
          setProfileChecked(true);
        }
      },
    });
    setTokenClient(client);
  }

  function connectGoogle() {
    if (tokenClient) tokenClient.requestAccessToken();
  }

  // ── Onboarding ─────────────────────────────────────────────────────────────
  async function handleOnboardSubmit() {
    if (!onboardCompany.trim()) return;
    setOnboardError("");
    setOnboarding(true);
    try {
      const newProfile = {
        companyName: onboardCompany.trim(),
        accountantName: onboardAccountant.trim(),
      };
      await saveProfile(accessToken, rootFolderId, newProfile);
      const monthLabel = new Date().toISOString().slice(0, 7);
      await ensureCompanyMonthFolders(accessToken, rootFolderId, newProfile.companyName, monthLabel);
      setProfile(newProfile);
    } catch (err) {
      setOnboardError(err.message);
    } finally {
      setOnboarding(false);
    }
  }

  // ── Receipt capture ───────────────────────────────────────────────────────
  function handleFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    setForm(null);
    setStatus(null);
    setMimeType(file.type);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      setImagePreview(dataUrl);
      const base64 = dataUrl.split(",")[1];
      setImageBase64(base64);
      extractReceipt(base64, file.type);
    };
    reader.readAsDataURL(file);
  }

  async function extractReceipt(base64, mediaType) {
    setExtracting(true);
    setStatus({ type: "info", text: "Reading receipt..." });
    try {
      const res  = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mediaType }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Extraction failed");
      setCategories(data.categories || []);
      setForm({
        date:     data.result.date     || "",
        place:    data.result.place    || "",
        total:    data.result.total    || "",
        hst:      data.result.hst      || "",
        currency: data.result.currency || "CAD",
        category: data.result.category_suggestion || (data.categories || [])[0],
        notes:    data.result.notes    || "",
      });
      setStatus({ type: "success", text: "Receipt read. Review and save." });
    } catch (err) {
      setStatus({ type: "error", text: err.message });
    } finally {
      setExtracting(false);
    }
  }

  function updateField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSave() {
    if (!accessToken) {
      setStatus({ type: "error", text: "Connect Google Drive first" });
      return;
    }
    if (!form || !imageBase64) return;
    if (!profile?.companyName) {
      setStatus({ type: "error", text: "Missing company profile — reload and complete setup" });
      return;
    }
    setSaving(true);
    setStatus({ type: "info", text: "Saving to Google Drive..." });
    try {
      const monthLabel = (form.date || new Date().toISOString().slice(0, 10)).slice(0, 7);
      const filename   = formatReceiptFilename(form.date, form.place, mimeType);
      await saveExpenseToDrive(accessToken, {
        companyName: profile.companyName,
        monthLabel,
        imageBase64,
        mimeType: mimeType || "image/jpeg",
        filename,
        rowValues: [form.date, form.place, form.total, form.hst, form.currency, form.category, form.notes],
        sheetHeader: SHEET_HEADER,
      });
      setStatus({ type: "success", text: `Saved to Drive · BIXT / ${profile.companyName} / ${monthLabel}` });
      resetForNext();
    } catch (err) {
      setStatus({ type: "error", text: err.message });
    } finally {
      setSaving(false);
    }
  }

  function resetForNext() {
    setImagePreview(null);
    setImageBase64(null);
    setForm(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // ── Accountant sharing ────────────────────────────────────────────────────
  async function openShare() {
    setShowShare(true);
    setShareStatus(null);
    if (!rootFolderId || !accessToken) return;
    try {
      const list = await listSharedEmails(accessToken, rootFolderId);
      setSharedList(list);
    } catch {
      setSharedList([]);
    }
  }

  async function handleShare() {
    if (!accountantEmail || !rootFolderId || !accessToken) return;
    setShareLoading(true);
    setShareStatus(null);
    try {
      await shareWithEmail(accessToken, rootFolderId, accountantEmail, "reader");
      setShareStatus({ type: "success", text: `Shared with ${accountantEmail}` });
      setAccountantEmail("");
      const list = await listSharedEmails(accessToken, rootFolderId);
      setSharedList(list);
    } catch (err) {
      setShareStatus({ type: "error", text: err.message });
    } finally {
      setShareLoading(false);
    }
  }

  async function handleRemove(permId, email) {
    if (!rootFolderId || !accessToken) return;
    try {
      await removeSharedEmail(accessToken, rootFolderId, permId);
      setSharedList((l) => l.filter((p) => p.id !== permId));
    } catch (err) {
      setShareStatus({ type: "error", text: `Could not remove ${email}` });
    }
  }

  // ── Change password ───────────────────────────────────────────────────────
  function openPasswordPanel() {
    setShowPassword(true);
    setPasswordStatus(null);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  }

  async function handleChangePassword() {
    if (newPassword !== confirmPassword) {
      setPasswordStatus({ type: "error", text: "New passwords don't match" });
      return;
    }
    if (newPassword.length < 6) {
      setPasswordStatus({ type: "error", text: "New password must be at least 6 characters" });
      return;
    }
    setPasswordLoading(true);
    setPasswordStatus(null);
    try {
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(auth.currentUser, credential);
      await updatePassword(auth.currentUser, newPassword);
      setPasswordStatus({ type: "success", text: "Password changed" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      const text =
        err.code === "auth/invalid-credential" || err.code === "auth/wrong-password"
          ? "Current password is incorrect"
          : err.message;
      setPasswordStatus({ type: "error", text });
    } finally {
      setPasswordLoading(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="container">
      <Script src="https://accounts.google.com/gsi/client" onLoad={handleGsiLoad} />

      <div className="app-header">
        <div>
          <h1>BIXT</h1>
          <div className="subtitle">Snap a receipt. AI reads it. Saved to Drive.</div>
        </div>
        <div className="user-menu">
          {accessToken && (
            <button
              className="share-icon-btn"
              onClick={openShare}
              title="Share with accountant"
            >
              👤
            </button>
          )}
          {hasPasswordProvider && (
            <button
              className="share-icon-btn"
              onClick={openPasswordPanel}
              title="Change password"
            >
              🔑
            </button>
          )}
          {user?.photoURL && (
            <img
              src={user.photoURL}
              className="avatar"
              alt="avatar"
              referrerPolicy="no-referrer"
            />
          )}
          <button className="signout-btn" onClick={() => signOut(auth)} title="Sign out">
            ↩
          </button>
        </div>
      </div>

      {/* ── Share with Accountant panel ── */}
      {showShare && (
        <div className="card share-panel">
          <div className="share-header">
            <span>Share with Accountant</span>
            <button className="close-btn" onClick={() => setShowShare(false)}>✕</button>
          </div>
          <p className="share-desc">
            Your accountant gets <strong>view-only</strong> access to the BIXT folder in your Drive — receipts and spreadsheets only, nothing else.
          </p>
          <label>Accountant's email</label>
          <div className="share-row">
            <input
              type="email"
              value={accountantEmail}
              onChange={(e) => setAccountantEmail(e.target.value)}
              placeholder="accountant@firm.com"
              onKeyDown={(e) => e.key === "Enter" && handleShare()}
            />
            <button
              className="btn btn-primary share-send-btn"
              onClick={handleShare}
              disabled={!accountantEmail || shareLoading}
            >
              {shareLoading ? "…" : "Invite"}
            </button>
          </div>

          {shareStatus && (
            <div className={`status status-${shareStatus.type}`}>{shareStatus.text}</div>
          )}

          {sharedList && sharedList.length > 0 && (
            <div className="shared-list">
              <div className="shared-list-label">Current access</div>
              {sharedList.map((p) => (
                <div key={p.id} className="shared-item">
                  <span>{p.emailAddress}</span>
                  <button
                    className="remove-btn"
                    onClick={() => handleRemove(p.id, p.emailAddress)}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          {sharedList && sharedList.length === 0 && (
            <p className="share-empty">No one else has access yet.</p>
          )}
        </div>
      )}

      {/* ── Change Password panel ── */}
      {showPassword && (
        <div className="card share-panel">
          <div className="share-header">
            <span>Change Password</span>
            <button className="close-btn" onClick={() => setShowPassword(false)}>✕</button>
          </div>

          <label>Current password</label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />

          <label>New password</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />

          <label>Confirm new password</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleChangePassword()}
          />

          <div style={{ marginTop: 14 }}>
            <button
              className="btn btn-primary"
              onClick={handleChangePassword}
              disabled={!currentPassword || !newPassword || !confirmPassword || passwordLoading}
            >
              {passwordLoading ? "Changing…" : "Change Password"}
            </button>
          </div>

          {passwordStatus && (
            <div className={`status status-${passwordStatus.type}`}>{passwordStatus.text}</div>
          )}
        </div>
      )}

      {/* ── Connect Drive ── */}
      {!accessToken && (
        <div className="card">
          <div style={{ marginBottom: 10, fontSize: 14 }}>
            Connect your Google Drive to get started
          </div>
          <button className="btn btn-primary" onClick={connectGoogle} disabled={!gsiReady}>
            {gsiReady ? "Connect Google Drive" : "Loading..."}
          </button>
        </div>
      )}

      {/* ── Onboarding ── */}
      {accessToken && profileChecked && !profile && (
        <div className="card">
          <div style={{ marginBottom: 10, fontSize: 14, fontWeight: 600 }}>
            Set up BIXT
          </div>
          <label>Company Name <span className="required">*</span></label>
          <input
            value={onboardCompany}
            onChange={(e) => setOnboardCompany(e.target.value)}
            placeholder="Acme Inc."
          />

          <label>Accountant Name</label>
          <input
            value={onboardAccountant}
            onChange={(e) => setOnboardAccountant(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleOnboardSubmit()}
          />

          {onboardError && <div className="status status-error">{onboardError}</div>}

          <div style={{ marginTop: 16 }}>
            <button
              className="btn btn-primary"
              onClick={handleOnboardSubmit}
              disabled={!onboardCompany.trim() || onboarding}
            >
              Get Started
            </button>
          </div>
        </div>
      )}

      {onboarding && (
        <div className="onboarding-overlay">
          <div className="onboarding-modal">
            <div className="spinner" />
            <p>Creating your folder on Google Drive…</p>
            <p className="onboarding-path">
              BIXT / {onboardCompany || "…"} / {new Date().getFullYear()} / {String(new Date().getMonth() + 1).padStart(2, "0")}
            </p>
          </div>
        </div>
      )}

      {/* ── Receipt capture ── */}
      {accessToken && profile && (
        <div className="card">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileChange}
            className="hidden-input"
            id="receiptInput"
          />
          {!imagePreview && (
            <label htmlFor="receiptInput" className="btn btn-primary" style={{ cursor: "pointer" }}>
              Take / Upload Receipt Photo
            </label>
          )}

          {imagePreview && (
            <img src={imagePreview} className="receipt-preview" alt="receipt" />
          )}

          {status && (
            <div className={`status status-${status.type}`}>{status.text}</div>
          )}

          {form && (
            <>
              <label>Date</label>
              <input
                value={form.date}
                onChange={(e) => updateField("date", e.target.value)}
                placeholder="YYYY-MM-DD"
              />

              <label>Place</label>
              <input
                value={form.place}
                onChange={(e) => updateField("place", e.target.value)}
              />

              <div className="row">
                <div>
                  <label>Total</label>
                  <input
                    value={form.total}
                    onChange={(e) => updateField("total", e.target.value)}
                  />
                </div>
                <div>
                  <label>HST / Tax</label>
                  <input
                    value={form.hst}
                    onChange={(e) => updateField("hst", e.target.value)}
                  />
                </div>
              </div>

              <label>
                Category <span className="badge">AI suggested</span>
              </label>
              <select
                value={form.category}
                onChange={(e) => updateField("category", e.target.value)}
              >
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>

              <label>Notes</label>
              <input
                value={form.notes}
                onChange={(e) => updateField("notes", e.target.value)}
              />

              <div style={{ marginTop: 20 }}>
                <button
                  className="btn btn-success"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? "Saving..." : "Save to Drive"}
                </button>
              </div>
              <div style={{ marginTop: 10 }}>
                <button
                  className="btn btn-secondary"
                  onClick={resetForNext}
                  disabled={saving}
                >
                  Discard & Retake
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
