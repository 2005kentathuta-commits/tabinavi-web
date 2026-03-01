import { getSessionFromServer, signIn, signInGuest, signUp, syncClerkSession, updateProfile } from './api';
import {
  clearPasswordSyncToken,
  clearStoredSession,
  getStoredSession,
  setPasswordSyncToken,
  setStoredSession,
  subscribeSession,
} from './session';

export const isSupabaseConfigured = true;

const authListeners = new Set();

subscribeSession((session) => {
  const event = session ? 'SIGNED_IN' : 'SIGNED_OUT';
  for (const listener of authListeners) {
    listener(event, session);
  }
});

async function getSession() {
  const local = getStoredSession();
  if (!local) {
    const clerkSession = await trySyncSessionFromClerk();
    if (clerkSession) {
      return { data: { session: clerkSession }, error: null };
    }
    return { data: { session: null }, error: null };
  }

  try {
    const payload = await getSessionFromServer();
    const session = payload?.data?.session || null;
    if (!session) {
      clearStoredSession();
      return { data: { session: null }, error: null };
    }
    setStoredSession(session);
    return { data: { session }, error: null };
  } catch {
    return { data: { session: local }, error: null };
  }
}

function onAuthStateChange(callback) {
  authListeners.add(callback);
  return {
    data: {
      subscription: {
        unsubscribe() {
          authListeners.delete(callback);
        },
      },
    },
  };
}

async function readClerkToken() {
  if (typeof window === 'undefined') {
    return '';
  }

  const clerk = window.Clerk;
  if (!clerk) {
    return '';
  }

  try {
    if (typeof clerk.load === 'function') {
      await clerk.load();
    }
  } catch {
    return '';
  }

  const getToken = clerk?.session?.getToken;
  if (typeof getToken !== 'function') {
    return '';
  }

  try {
    const token = await getToken.call(clerk.session);
    return String(token || '');
  } catch {
    return '';
  }
}

async function trySyncSessionFromClerk() {
  const clerkToken = await readClerkToken();
  if (!clerkToken) {
    return null;
  }

  try {
    const payload = await syncClerkSession({}, clerkToken);
    const session = payload?.data?.session || null;
    if (session) {
      setStoredSession(session);
    }
    return session;
  } catch {
    return null;
  }
}

async function signUpWithEmail(input) {
  try {
    const payload = await signUp({
      email: input.email,
      password: input.password,
      displayName: input.options?.data?.display_name || 'Traveler',
    });

    const session = payload?.data?.session || null;
    const user = payload?.data?.user || null;
    const passwordSyncToken = String(payload?.data?.passwordSyncToken || '');

    if (session) {
      setStoredSession(session);
    }
    if (passwordSyncToken) {
      setPasswordSyncToken(passwordSyncToken);
    }

    return {
      data: {
        user,
        session,
      },
      error: null,
    };
  } catch (err) {
    return {
      data: {
        user: null,
        session: null,
      },
      error: {
        message: err.message || 'サインアップに失敗しました。',
      },
    };
  }
}

async function signInWithPassword(input) {
  try {
    const payload = await signIn({
      email: input.email,
      password: input.password,
    });

    const session = payload?.data?.session || null;
    if (session) {
      clearPasswordSyncToken();
    }
    if (session) {
      setStoredSession(session);
    }

    return {
      data: {
        user: payload?.data?.user || null,
        session,
      },
      error: null,
    };
  } catch (err) {
    return {
      data: {
        user: null,
        session: null,
      },
      error: {
        message: err.message || 'ログインに失敗しました。',
      },
    };
  }
}

async function signInAsGuest(input) {
  try {
    const payload = await signInGuest({
      displayName: input?.displayName || '',
    });

    const session = payload?.data?.session || null;
    if (session) {
      setStoredSession(session);
    }

    return {
      data: {
        user: payload?.data?.user || null,
        session,
      },
      error: null,
    };
  } catch (err) {
    return {
      data: {
        user: null,
        session: null,
      },
      error: {
        message: err.message || 'ゲスト開始に失敗しました。',
      },
    };
  }
}

async function signOut() {
  if (typeof window !== 'undefined' && window.Clerk && typeof window.Clerk.signOut === 'function') {
    try {
      await window.Clerk.signOut();
    } catch {
      // ignore Clerk sign-out failures and clear local session anyway
    }
  }
  clearPasswordSyncToken();
  clearStoredSession();
  return { error: null };
}

async function updateUser(input) {
  try {
    const payload = await updateProfile(input);
    const session = payload?.data?.session || null;
    const user = payload?.data?.user || session?.user || null;
    const passwordSyncToken = String(payload?.data?.passwordSyncToken || '');

    if (session) {
      setStoredSession(session);
    }
    if (passwordSyncToken) {
      setPasswordSyncToken(passwordSyncToken);
    }

    return {
      data: {
        user,
        session,
      },
      error: null,
    };
  } catch (err) {
    return {
      data: {
        user: null,
        session: null,
      },
      error: {
        message: err.message || 'プロフィール更新に失敗しました。',
      },
    };
  }
}

export const supabase = {
  auth: {
    getSession,
    onAuthStateChange,
    signUp: signUpWithEmail,
    signInWithPassword,
    signInGuest: signInAsGuest,
    signOut,
    updateUser,
  },
};
