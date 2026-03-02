import { getAccessToken, getPasswordSyncToken } from './session';

const inferApiBase = () => {
  if (import.meta.env.VITE_API_BASE) {
    return import.meta.env.VITE_API_BASE;
  }

  if (typeof window !== 'undefined') {
    return window.location.origin;
  }

  return 'http://localhost:8787';
};

export const API_BASE = inferApiBase();

const responseCache = new Map();
const etagCache = new Map();

function getMethod(options = {}) {
  return String(options.method || 'GET').toUpperCase();
}

function cacheKey(path, method, authToken = '') {
  return `${method}:${path}:auth:${authToken || 'anonymous'}`;
}

function clearGetCache() {
  responseCache.clear();
  etagCache.clear();
}

export class ApiError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function readClerkToken() {
  if (typeof window === 'undefined') {
    return '';
  }

  const clerk = window.Clerk;
  if (!clerk?.session || typeof clerk.session.getToken !== 'function') {
    return '';
  }

  try {
    const token = await clerk.session.getToken();
    return String(token || '');
  } catch {
    return '';
  }
}

async function request(path, options = {}, { auth = true } = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  const method = getMethod(options);
  let token = '';

  if (auth) {
    const localToken = getAccessToken();
    const clerkToken = localToken ? '' : await readClerkToken();
    token = localToken || clerkToken;
    if (token && !headers.Authorization) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  const key = cacheKey(path, method, token);
  if (method === 'GET') {
    const knownEtag = etagCache.get(key);
    if (knownEtag && !headers['If-None-Match']) {
      headers['If-None-Match'] = knownEtag;
    }
  } else {
    clearGetCache();
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (method === 'GET' && response.status === 304) {
    if (responseCache.has(key)) {
      return responseCache.get(key);
    }
    throw new ApiError('データ更新の確認に失敗しました。', 304);
  }

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ApiError(payload.error || '通信に失敗しました。', response.status);
  }

  if (method === 'GET') {
    const etag = response.headers.get('etag');
    if (etag) {
      etagCache.set(key, etag);
    }
    responseCache.set(key, payload);
  }

  return payload;
}

export function getSessionFromServer() {
  return request('/api/auth/session', { method: 'GET' }, { auth: true });
}

export function getPublicConfig() {
  return request('/api/public-config', { method: 'GET' }, { auth: false });
}

export function signUp(input) {
  return request(
    '/api/auth/signup',
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
    { auth: false },
  );
}

export function signIn(input) {
  const passwordSyncToken = getPasswordSyncToken();
  const payload = {
    ...input,
    ...(passwordSyncToken ? { passwordSyncToken } : {}),
  };

  return request(
    '/api/auth/login',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    { auth: false },
  );
}

export function signInGuest(input) {
  return request(
    '/api/auth/guest',
    {
      method: 'POST',
      body: JSON.stringify(input || {}),
    },
    { auth: false },
  );
}

export function updateProfile(input) {
  return request('/api/auth/profile', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function requestPasswordReset(input) {
  return request(
    '/api/auth/password/request',
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
    { auth: false },
  );
}

export function resetPassword(input) {
  return request(
    '/api/auth/password/reset',
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
    { auth: false },
  );
}

export function syncClerkSession(input = {}, clerkToken = '') {
  return request(
    '/api/auth/clerk/sync',
    {
      method: 'POST',
      headers: clerkToken ? { Authorization: `Bearer ${clerkToken}` } : {},
      body: JSON.stringify(input),
    },
    { auth: false },
  );
}

export function checkRegisteredEmail(input) {
  return request('/api/admin/email-status', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function listRegisteredEmails() {
  return request('/api/admin/registered-emails', { method: 'GET' });
}

export function listTrips() {
  return request('/api/trips', { method: 'GET' });
}

export function createTrip(input) {
  return request('/api/trips', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function joinTrip(input) {
  return request('/api/trips/join', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function fetchWorkspace(tripId) {
  return request(`/api/trips/${tripId}/workspace`, { method: 'GET' });
}

export function createItinerary(tripId, input) {
  return request(`/api/trips/${tripId}/itinerary`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function editItinerary(itemId, input) {
  return request(`/api/itinerary/${itemId}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export function removeItinerary(itemId) {
  return request(`/api/itinerary/${itemId}`, {
    method: 'DELETE',
  });
}

export function reorderItinerary(tripId, itemIds) {
  return request(`/api/trips/${tripId}/itinerary/reorder`, {
    method: 'POST',
    body: JSON.stringify({ itemIds }),
  });
}

export function createGuideSection(tripId, input) {
  return request(`/api/trips/${tripId}/guide`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function editGuideSection(sectionId, input) {
  return request(`/api/guide/${sectionId}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export function removeGuideSection(sectionId) {
  return request(`/api/guide/${sectionId}`, {
    method: 'DELETE',
  });
}

export function reorderGuide(tripId, sectionIds) {
  return request(`/api/trips/${tripId}/guide/reorder`, {
    method: 'POST',
    body: JSON.stringify({ sectionIds }),
  });
}

export function createMemory(tripId, input) {
  return request(`/api/trips/${tripId}/memories`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function findSimilarMemories(tripId, input) {
  return request(`/api/trips/${tripId}/memories/similar`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function editMemory(memoryId, input) {
  return request(`/api/memories/${memoryId}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export function removeMemory(memoryId) {
  return request(`/api/memories/${memoryId}`, {
    method: 'DELETE',
  });
}

export function saveTripDesign(tripId, input) {
  return request(`/api/trips/${tripId}/design`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function saveTripCover(tripId, input) {
  return request(`/api/trips/${tripId}/cover`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function sendInviteEmail(tripId, input) {
  return request(`/api/trips/${tripId}/invite-email`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
