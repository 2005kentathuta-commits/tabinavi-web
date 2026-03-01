const SESSION_KEY = 'tabinoshiori_session_v1';
const PASSWORD_SYNC_KEY = 'tabinoshiori_password_sync_v1';
const listeners = new Set();

function parseSession(raw) {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed?.access_token || !parsed?.user?.id) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function getStoredSession() {
  if (typeof window === 'undefined') {
    return null;
  }
  return parseSession(window.localStorage.getItem(SESSION_KEY));
}

export function setStoredSession(session) {
  if (typeof window === 'undefined') {
    return;
  }
  if (!session) {
    clearStoredSession();
    return;
  }
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  for (const listener of listeners) {
    listener(session);
  }
}

export function clearStoredSession() {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.removeItem(SESSION_KEY);
  for (const listener of listeners) {
    listener(null);
  }
}

export function getAccessToken() {
  const session = getStoredSession();
  return session?.access_token || '';
}

export function subscribeSession(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getPasswordSyncToken() {
  if (typeof window === 'undefined') {
    return '';
  }
  return String(window.localStorage.getItem(PASSWORD_SYNC_KEY) || '');
}

export function setPasswordSyncToken(token) {
  if (typeof window === 'undefined') {
    return;
  }
  const normalized = String(token || '').trim();
  if (!normalized) {
    window.localStorage.removeItem(PASSWORD_SYNC_KEY);
    return;
  }
  window.localStorage.setItem(PASSWORD_SYNC_KEY, normalized);
}

export function clearPasswordSyncToken() {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.removeItem(PASSWORD_SYNC_KEY);
}
