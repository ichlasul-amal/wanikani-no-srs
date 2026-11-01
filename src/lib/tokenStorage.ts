// Opt-in "remember me". Storage can be unavailable (private mode, blocked
// site data), so every access is guarded and failure just means the
// token isn't remembered.
const KEY = "wk-no-srs:token";

export function loadSavedToken(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function saveToken(token: string): void {
  try {
    localStorage.setItem(KEY, token);
  } catch {
    // ignore
  }
}

export function clearSavedToken(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
