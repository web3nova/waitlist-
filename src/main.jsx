import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const initialResult = {
  message: "You're on the waitlist! Follow us on X: https://x.com/RoyalStack_",
  inviteCode: "",
  inviteLink: ""
};

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
const endpointCandidates = [`${apiBaseUrl}/api/waitlist`];
const telegramUrl = "https://t.me/+0buH15eq1NVkZDM0";
const xUrl = "https://x.com/RoyalStack_";

function validate(payload) {
  const errors = {};

  if (!/^0x[a-fA-F0-9]{40}$/.test(payload.walletAddress)) {
    errors.walletAddress = "Use a valid 0x wallet address.";
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email) || payload.email.length > 320) {
    errors.email = "Use a valid email address up to 320 characters.";
  }

  if (!/^[a-zA-Z0-9_.-]{1,30}$/.test(payload.username)) {
    errors.username = "Use 1-30 letters, numbers, underscores, dots, or hyphens.";
  }

  if (payload.referredBy && !/^[0-9a-fA-F]{10}$/.test(payload.referredBy)) {
    errors.referredBy = "Use a 10-character invite code.";
  }

  return errors;
}

async function submitWaitlist(payload) {
  let lastError;

  for (const endpoint of endpointCandidates) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json();

      if (!response.ok) {
        const error = new Error(data.message || data.error || "Waitlist request failed.");
        error.data = data;
        throw error;
      }

      return data;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

function fallbackInvite(payload) {
  const seed = `${payload.username}-${payload.walletAddress}`.replace(/[^a-z0-9]/gi, "");
  const inviteCode = (seed || "royalstack").slice(0, 10).toLowerCase().padEnd(10, "0");

  return {
    message: "You're on the waitlist! Follow us on X: https://x.com/RoyalStack_",
    inviteCode,
    inviteLink: `https://royalstack.io/invite/${inviteCode}`
  };
}

function PokerTableArt() {
  return (
    <div className="table-scene" aria-hidden="true">
      <div className="poker-table">
        <div className="rail rail-one" />
        <div className="rail rail-two" />
        <div className="card card-one">
          A<span>spades</span>
        </div>
        <div className="card card-two">
          K<span>hearts</span>
        </div>
        <div className="chip chip-one" />
        <div className="chip chip-two" />
        <div className="chip chip-three" />
      </div>
    </div>
  );
}

function Field({ error, label, name, ...props }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input name={name} aria-invalid={Boolean(error)} {...props} />
      <small>{error}</small>
    </label>
  );
}

function App() {
  const [errors, setErrors] = useState({});
  const [result, setResult] = useState(initialResult);
  const [showResult, setShowResult] = useState(false);
  const [copyLabel, setCopyLabel] = useState("Copy link");
  const [isSubmitting, setSubmitting] = useState(false);
  const [social, setSocial] = useState({
    followedX: false,
    joinedTG: false
  });

  async function copyInviteLink() {
    if (!result.inviteLink) return;

    try {
      await navigator.clipboard.writeText(result.inviteLink);
      setCopyLabel("Copied");
      window.setTimeout(() => setCopyLabel("Copy link"), 1600);
    } catch {
      setCopyLabel("Copy failed");
      window.setTimeout(() => setCopyLabel("Copy link"), 1600);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = {
      walletAddress: String(formData.get("walletAddress") || "").trim(),
      email: String(formData.get("email") || "").trim(),
      username: String(formData.get("username") || "").trim(),
      referredBy: String(formData.get("referredBy") || "").trim(),
      ...social
    };
    const nextErrors = validate(payload);

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);

    try {
      const data = window.location.protocol === "file:" ? fallbackInvite(payload) : await submitWaitlist(payload);
      setResult({
        message: data.message || "You're on the waitlist!",
        inviteCode: data.inviteCode || "",
        inviteLink: data.inviteLink || ""
      });
      setShowResult(true);
      form.reset();
      setSocial({
        followedX: false,
        joinedTG: false
      });
    } catch (error) {
      setErrors(error.data?.errors || {});
      setResult({
        message: error.message || "Could not join the waitlist.",
        inviteCode: "",
        inviteLink: ""
      });
      setShowResult(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="app-shell">
      <section className="hero" aria-labelledby="page-title">
        <header className="brand-bar">
          <span className="brand-mark">M</span>
          <span>RoyalStack</span>
        </header>

        <div className="hero-copy">
          <p className="eyebrow">Red table access</p>
          <h1 id="page-title">Join the RoyalStack waitlist.</h1>
          <p>
            Drop your wallet, claim your player name, and get an invite code ready for early table access.
          </p>
        </div>

        <PokerTableArt />
      </section>

      <section className="waitlist-panel" aria-label="RoyalStack waitlist form">
        <form onSubmit={handleSubmit} noValidate>
          <div className="form-heading">
            <p className="eyebrow">Early player list</p>
            <h2>Reserve your seat</h2>
          </div>

          <Field
            error={errors.walletAddress}
            label="Wallet address"
            name="walletAddress"
            placeholder="0x..."
            autoComplete="off"
            required
          />

          <Field
            error={errors.email}
            label="Email"
            name="email"
            type="email"
            placeholder="player@royalstack.io"
            autoComplete="email"
            required
          />

          <Field
            error={errors.username}
            label="Username"
            name="username"
            placeholder="redtable.pro"
            autoComplete="username"
            required
          />

          <Field
            error={errors.referredBy}
            label="Referral code"
            name="referredBy"
            placeholder="Optional code"
            autoComplete="off"
          />

          <div className="social-actions" aria-label="Social actions">
            <a
              className={social.followedX ? "social-button is-done" : "social-button"}
              href={xUrl}
              target="_blank"
              rel="noreferrer"
              onClick={() => setSocial((current) => ({ ...current, followedX: true }))}
            >
              Follow X
            </a>
            <a
              className={social.joinedTG ? "social-button is-done" : "social-button"}
              href={telegramUrl}
              target="_blank"
              rel="noreferrer"
              onClick={() => setSocial((current) => ({ ...current, joinedTG: true }))}
            >
              Join Telegram group
            </a>
          </div>

          <button className="submit-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Joining..." : "Join waitlist"}
          </button>
        </form>

        {showResult && (
          <output className={result.inviteCode ? "response-box is-success" : "response-box is-error"} aria-live="polite">
            {result.inviteCode && (
              <>
                <span className="response-label">You're on the list</span>
                <div className="success-hero">
                  <span>Your invite code</span>
                  <strong>{result.inviteCode}</strong>
                  <p>Share your referral link to bring more players to the table.</p>
                </div>

                <div className="referral-panel">
                  <span>Your referral link</span>
                  <div className="referral-row">
                    <code>{result.inviteLink}</code>
                    <button type="button" onClick={copyInviteLink}>
                      {copyLabel}
                    </button>
                  </div>
                </div>

                <div className="success-actions">
                  <a
                    className="share-button"
                    href={`https://x.com/intent/tweet?text=${encodeURIComponent(`I joined the RoyalStack waitlist. Join with my invite: ${result.inviteLink}`)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Share on X
                  </a>
                  <a className="telegram-button" href={telegramUrl} target="_blank" rel="noreferrer">
                    Join Telegram
                  </a>
                  <a
                    className="leaderboard-button"
                    href={`${apiBaseUrl || "https://royalstack.onrender.com"}/api/waitlist/leaderboard`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View referral leaderboard
                  </a>
                </div>
              </>
            )}

            {!result.inviteCode && (
              <>
                <span className="response-label">Could not join</span>
                <strong>{result.message}</strong>
              </>
            )}
          </output>
        )}
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
