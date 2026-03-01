import {
  createGuideSection,
  createItinerary,
  createMemory,
  createTrip,
  editGuideSection,
  editItinerary,
  editMemory,
  fetchWorkspace,
  joinTrip,
  listTrips,
  removeGuideSection,
  removeItinerary,
  removeMemory,
  reorderItinerary,
  saveTripCover,
  saveTripDesign,
} from './api';

export const DEFAULT_THEME = {
  primaryColor: '#0b6fa4',
  accentColor: '#ff7a3d',
  backgroundStyle: 'sunrise',
  fontStyle: 'mplus',
  stampText: '足袋navi',
};

export function normalizeTheme(theme) {
  return {
    ...DEFAULT_THEME,
    ...(theme && typeof theme === 'object' ? theme : {}),
  };
}

export function normalizeGuideStyle(style) {
  const rawDetails = Array.isArray(style?.details) ? style.details : [];
  const details = rawDetails
    .slice(0, 40)
    .map((entry) => ({
      id: String(entry?.id || `detail_${Math.random().toString(36).slice(2, 10)}`),
      label: String(entry?.label || '').trim(),
      value: String(entry?.value || '').trim(),
    }))
    .filter((entry) => entry.label || entry.value);

  const normalized = {
    variant: 'plain',
    emoji: '📍',
    ...(style && typeof style === 'object' ? style : {}),
  };

  normalized.details = details;
  return normalized;
}

async function toDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result || '');
    reader.onerror = () => reject(new Error('画像の読み込みに失敗しました。'));
    reader.readAsDataURL(file);
  });
}

function enforceImageLimit(files) {
  const list = Array.from(files || []);
  for (const file of list) {
    if (file.size > 4 * 1024 * 1024) {
      throw new Error(`画像サイズが大きすぎます: ${file.name} (4MBまで)`);
    }
  }
}

export async function ensureProfile(user, preferredName = '') {
  return {
    id: user.id,
    display_name: preferredName || user.user_metadata?.display_name || user.email?.split('@')[0] || 'Traveler',
  };
}

export async function getProfile(userId) {
  void userId;
  return null;
}

export async function listTripsForUser(userId) {
  void userId;
  const payload = await listTrips();
  const trips = Array.isArray(payload.trips) ? payload.trips : [];
  return trips.map((trip) => ({
    ...trip,
    theme: normalizeTheme(trip.theme),
  }));
}

export async function createTripForUser(userId, input) {
  void userId;
  const payload = await createTrip(input);
  return {
    ...payload.trip,
    theme: normalizeTheme(payload.trip.theme),
  };
}

export async function joinTripByCode(_userId, code, passphrase = '') {
  const payload = await joinTrip({ code, passphrase });
  return payload.trip;
}

export async function fetchTripWorkspace(tripId) {
  const workspace = await fetchWorkspace(tripId);
  return {
    trip: {
      ...workspace.trip,
      theme: normalizeTheme(workspace.trip.theme),
    },
    members: (workspace.members || []).map((entry) => ({
      ...entry,
      name: entry.name || 'Traveler',
    })),
    itineraryItems: (workspace.itineraryItems || []).map((entry) => ({
      ...entry,
      icon: String(entry.icon || '📍'),
      link_url: String(entry.link_url || ''),
      order_index: Number.isFinite(entry.order_index) ? entry.order_index : null,
    })),
    guideSections: (workspace.guideSections || []).map((entry) => ({
      ...entry,
      style: normalizeGuideStyle(entry.style),
    })),
    memories: workspace.memories || [],
  };
}

export async function addItineraryItem(tripId, _userId, input) {
  await createItinerary(tripId, input);
}

export async function updateItineraryItem(itemId, input) {
  await editItinerary(itemId, input);
}

export async function deleteItineraryItem(itemId) {
  await removeItinerary(itemId);
}

export async function reorderItineraryItems(tripId, itemIds) {
  await reorderItinerary(tripId, itemIds);
}

export async function addGuideSection(tripId, input) {
  await createGuideSection(tripId, input);
}

export async function updateGuideSection(sectionId, input) {
  await editGuideSection(sectionId, input);
}

export async function deleteGuideSection(sectionId) {
  await removeGuideSection(sectionId);
}

export async function addMemory(tripId, _userId, input, files = []) {
  enforceImageLimit(files);
  const normalizedFiles = [];
  for (const file of files.slice(0, 3)) {
    const dataUrl = await toDataUrl(file);
    normalizedFiles.push({
      name: file.name,
      dataUrl,
    });
  }

  await createMemory(tripId, {
    ...input,
    files: normalizedFiles,
  });
}

export async function updateMemory(memoryId, input) {
  await editMemory(memoryId, input);
}

export async function deleteMemory(memory) {
  await removeMemory(memory.id);
}

export async function uploadTripCover(tripId, file, oldPath = '') {
  void oldPath;
  if (!file) {
    throw new Error('ファイルが未選択です。');
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('表紙画像は5MBまでです。');
  }

  const dataUrl = await toDataUrl(file);

  const payload = await saveTripCover(tripId, {
    file: {
      name: file.name,
      dataUrl,
    },
  });

  return payload.trip;
}

export async function updateTripDesign(tripId, input) {
  const payload = await saveTripDesign(tripId, input);
  return payload.trip;
}

export function subscribeTripChanges(_tripId, onChange) {
  const timer = window.setInterval(() => {
    onChange();
  }, 4000);

  return () => {
    window.clearInterval(timer);
  };
}
