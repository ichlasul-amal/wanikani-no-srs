import { useState } from "react";
import { Loader2 } from "lucide-react";
import { WaniKaniError, getUser } from "../api/wanikani";
import { ErrorBanner } from "./ui";

export default function TokenGate({ onConnected, initialError = null }) {
  const [tokenInput, setTokenInput] = useState("");
  const [remember, setRemember] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState(initialError);

  async function handleSubmit(e) {
    e.preventDefault();
    const token = tokenInput.trim();
    if (!token) return;
    setChecking(true);
    setError(null);
    try {
      const user = await getUser(token);
      onConnected(token, user, remember);
    } catch (err) {
      setChecking(false);
      setError(err instanceof WaniKaniError ? err.message : "Something went wrong while connecting.");
    }
  }

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <header className="mb-8 text-center">
        <h1 className="text-3xl font-serif font-bold text-slate-900 dark:text-slate-100 mb-2">WaniKani — No SRS</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm">
          Connect your WaniKani account to study your own radicals, kanji, and vocabulary, with no SRS
          scheduling, so you can drill any level whenever you want.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label
            htmlFor="wk-token"
            className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2"
          >
            WaniKani API token
          </label>
          <input
            id="wk-token"
            type="password"
            autoComplete="off"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            className="w-full px-4 py-3 rounded-xl border-2 border-slate-300 bg-white text-sm font-mono text-slate-900 focus:outline-none focus:border-slate-900 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100 dark:focus:border-slate-300 transition-colors"
          />
        </div>

        <label className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            Remember me on this device
            <span className="block text-xs text-slate-400">
              Stores the token in this browser's local storage. Only use this on a device you trust.
            </span>
          </span>
        </label>

        {error && <ErrorBanner>{error}</ErrorBanner>}

        <button
          type="submit"
          disabled={!tokenInput.trim() || checking}
          className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-slate-900 text-white font-semibold hover:brightness-95 dark:bg-slate-100 dark:text-slate-900 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {checking && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
          {checking ? "Connecting…" : "Connect"}
        </button>
      </form>

      <p className="text-xs text-slate-400 mt-4 leading-relaxed">
        Your token is only ever sent to WaniKani's own API. Unless you tick "Remember me", it lives in this tab
        only and is cleared when you close or reload it. A read-only token is enough. You can generate or revoke
        tokens at <span className="font-mono">wanikani.com/settings/personal_access_tokens</span>.
      </p>
    </div>
  );
}
