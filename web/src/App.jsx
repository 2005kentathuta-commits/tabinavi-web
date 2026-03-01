import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_THEME,
  addGuideSection,
  addItineraryItem,
  addMemory,
  createTripForUser,
  deleteGuideSection,
  deleteItineraryItem,
  deleteMemory,
  ensureProfile,
  fetchTripWorkspace,
  joinTripByCode,
  listTripsForUser,
  normalizeGuideStyle,
  normalizeTheme,
  subscribeTripChanges,
  updateGuideSection,
  updateItineraryItem,
  updateMemory,
  updateTripDesign,
  uploadTripCover,
  reorderItineraryItems,
} from './travelStore';
import { findSimilarMemories, requestPasswordReset, resetPassword } from './api';
import { exportGuidePdf, exportMemoriesPdf } from './pdf';
import { setPasswordSyncToken } from './session';
import { isSupabaseConfigured, supabase } from './supabase';
import './App.css';

const SELECTED_TRIP_KEY_PREFIX = 'travel_selected_trip_v2';

const defaultAuthForm = {
  displayName: '',
  email: '',
  password: '',
};

const defaultPasswordResetRequestForm = {
  email: '',
  displayName: '',
};

const defaultPasswordResetConfirmForm = {
  manualToken: '',
  newPassword: '',
  confirmPassword: '',
};

const defaultAccountForm = {
  displayName: '',
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
};

const defaultCreateForm = {
  name: '',
  destination: '',
  startDate: '',
  endDate: '',
  passphrase: '',
};

const defaultJoinForm = {
  code: '',
  passphrase: '',
};

const defaultItineraryForm = {
  date: '',
  startTime: '',
  endTime: '',
  title: '',
  place: '',
  linkUrl: '',
  icon: '📍',
  notes: '',
};

const defaultGuideForm = {
  title: '',
  content: '',
  variant: 'plain',
  emoji: '📍',
  details: [],
};

const defaultGuideDetailDraft = {
  label: '',
  value: '',
};

const defaultMemoryForm = {
  date: '',
  title: '',
  content: '',
};

const ITINERARY_ICON_OPTIONS = [
  { value: '📍', label: 'スポット' },
  { value: '🚃', label: '交通' },
  { value: '🍽️', label: 'ごはん' },
  { value: '☕', label: 'カフェ' },
  { value: '🏨', label: '宿泊' },
  { value: '🛍️', label: '買い物' },
  { value: '🎫', label: 'チケット' },
  { value: '🗺️', label: '観光' },
  { value: '📸', label: '撮影' },
  { value: '📝', label: 'メモ' },
];

const DESIGN_PRESETS = {
  classic: {
    stampText: '足袋navi',
    primaryColor: '#7f4f2d',
    accentColor: '#c97a3e',
    backgroundStyle: 'sunrise',
    fontStyle: 'mplus',
    layoutTemplate: 'atelier',
    pdfTemplate: 'timeline',
  },
  marine: {
    stampText: 'TRAVEL LOG',
    primaryColor: '#155d7a',
    accentColor: '#2c99d4',
    backgroundStyle: 'ocean',
    fontStyle: 'mplus',
    layoutTemplate: 'timeline',
    pdfTemplate: 'timeline',
  },
  journal: {
    stampText: 'MEMOIRS',
    primaryColor: '#5a4735',
    accentColor: '#a8754d',
    backgroundStyle: 'forest',
    fontStyle: 'serif',
    layoutTemplate: 'notebook',
    pdfTemplate: 'paper',
  },
  night: {
    stampText: 'NIGHT TRIP',
    primaryColor: '#232640',
    accentColor: '#5b70c8',
    backgroundStyle: 'night',
    fontStyle: 'hand',
    layoutTemplate: 'timeline',
    pdfTemplate: 'timeline',
  },
};

const defaultDesignForm = {
  coverTitle: '',
  coverSubtitle: '',
  stampText: DEFAULT_THEME.stampText,
  primaryColor: DEFAULT_THEME.primaryColor,
  accentColor: DEFAULT_THEME.accentColor,
  backgroundStyle: DEFAULT_THEME.backgroundStyle,
  fontStyle: DEFAULT_THEME.fontStyle,
  layoutTemplate: DEFAULT_THEME.layoutTemplate,
  pdfTemplate: DEFAULT_THEME.pdfTemplate,
};

const GUIDE_TEMPLATE_OPTIONS = [
  {
    key: 'overview',
    label: '旅の概要',
    apply: () => ({
      title: '旅の概要',
      content: '旅行の目的や集合場所、移動の流れをここにまとめます。',
      variant: 'highlight',
      emoji: '🗺️',
      details: [
        { label: '日付', value: '' },
        { label: '時間', value: '' },
        { label: '出来事', value: '' },
        { label: '場所', value: '' },
      ],
    }),
  },
  {
    key: 'checklist',
    label: '持ち物チェック',
    apply: () => ({
      title: '持ち物チェック',
      content: '- パスポート / 身分証\n- 充電器\n- 保険証\n- 常備薬',
      variant: 'plain',
      emoji: '🎒',
      details: [
        { label: '最終確認日', value: '' },
        { label: '忘れ物メモ', value: '' },
      ],
    }),
  },
  {
    key: 'emergency',
    label: '緊急連絡先',
    apply: () => ({
      title: '緊急連絡先',
      content: '家族・宿泊先・保険会社の連絡先を記載。',
      variant: 'note',
      emoji: '☎️',
      details: [
        { label: '家族', value: '' },
        { label: '宿泊先', value: '' },
        { label: '保険会社', value: '' },
        { label: '現地緊急番号', value: '' },
      ],
    }),
  },
  {
    key: 'budget',
    label: '予算メモ',
    apply: () => ({
      title: '予算メモ',
      content: '予算の上限と実績を管理します。',
      variant: 'note',
      emoji: '💰',
      details: [
        { label: '総予算', value: '' },
        { label: '交通費', value: '' },
        { label: '食費', value: '' },
        { label: '宿泊費', value: '' },
      ],
    }),
  },
];

const ITINERARY_QUICK_TEMPLATE_OPTIONS = [
  { key: 'move', label: '移動', icon: '🚃', title: '移動', notes: '移動手段・所要時間を記録' },
  { key: 'meal', label: '食事', icon: '🍽️', title: '食事', notes: '候補のお店や予約情報を記録' },
  { key: 'stay', label: '宿泊', icon: '🏨', title: 'チェックイン', notes: 'チェックイン時刻・住所を記録' },
  { key: 'spot', label: '観光', icon: '🗺️', title: '観光スポット', notes: '見どころ・滞在目安を記録' },
  { key: 'memo', label: 'メモ', icon: '📝', title: '共有メモ', notes: '集合場所や注意事項を記録' },
];

const LAYOUT_TEMPLATE_OPTIONS = [
  { key: 'atelier', label: 'Atelier（標準）' },
  { key: 'timeline', label: 'Timeline（時系列重視）' },
  { key: 'notebook', label: 'Notebook（手帳風）' },
];

const PDF_TEMPLATE_OPTIONS = [
  { key: 'timeline', label: 'タイムライン（推奨）' },
  { key: 'paper', label: 'しおり紙面（2カラム）' },
  { key: 'table', label: '表形式（業務向け）' },
];

function storageKey(userId) {
  return `${SELECTED_TRIP_KEY_PREFIX}:${userId}`;
}

function pickTheme(trip) {
  return normalizeTheme(trip?.theme || DEFAULT_THEME);
}

function backgroundClass(style) {
  if (style === 'ocean') {
    return 'cover-bg-ocean';
  }
  if (style === 'forest') {
    return 'cover-bg-forest';
  }
  if (style === 'night') {
    return 'cover-bg-night';
  }
  return 'cover-bg-sunrise';
}

function formatDateText(value) {
  return value || '未設定';
}

function newClientId(prefix = 'id') {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function readResetTokenFromUrl() {
  if (typeof window === 'undefined') {
    return '';
  }
  const params = new URLSearchParams(window.location.search);
  return params.get('resetToken') || '';
}

function readInviteCodeFromUrl() {
  if (typeof window === 'undefined') {
    return '';
  }
  const params = new URLSearchParams(window.location.search);
  return String(params.get('invite') || '').trim().toUpperCase();
}

function parseDateTimeMs(date, time, fallbackToEnd = false) {
  if (!date || !time) {
    return null;
  }
  const [year, month, day] = String(date).split('-').map((part) => Number(part));
  const [hour, minute] = String(time).split(':').map((part) => Number(part));
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute)
  ) {
    return null;
  }

  const dt = new Date(year, month - 1, day, hour, minute, fallbackToEnd ? 59 : 0, fallbackToEnd ? 999 : 0);
  const ms = dt.getTime();
  return Number.isFinite(ms) ? ms : null;
}

function computeNowNextIds(items, nowMs) {
  const candidates = items
    .map((item) => {
      const start = parseDateTimeMs(item.date, item.start_time);
      if (!start) {
        return null;
      }
      const end = parseDateTimeMs(item.date, item.end_time, true) || start + 60 * 60 * 1000;
      return {
        id: item.id,
        start,
        end: Math.max(end, start + 60 * 1000),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start);

  const current = candidates.find((entry) => nowMs >= entry.start && nowMs <= entry.end) || null;
  if (current) {
    return { nowId: current.id, nextId: '' };
  }

  const next = candidates.find((entry) => entry.start > nowMs) || null;
  return {
    nowId: '',
    nextId: next?.id || '',
  };
}

function groupItemsByDay(items) {
  const byDate = new Map();
  for (const item of items) {
    const key = item.date || 'undated';
    const current = byDate.get(key) || [];
    current.push(item);
    byDate.set(key, current);
  }

  const datedKeys = [...byDate.keys()]
    .filter((key) => key !== 'undated')
    .sort((a, b) => a.localeCompare(b));

  const sections = datedKeys.map((date, index) => ({
    key: date,
    label: `DAY${index + 1}`,
    title: `${date}`,
    items: byDate.get(date) || [],
  }));

  if (byDate.has('undated')) {
    sections.push({
      key: 'undated',
      label: 'FREE',
      title: '日付未設定',
      items: byDate.get('undated') || [],
    });
  }

  return sections;
}

function hydrateTemplateDetails(details = []) {
  return (details || []).map((detail) => ({
    id: newClientId('detail'),
    label: String(detail?.label || '').trim(),
    value: String(detail?.value || '').trim(),
  }));
}

function nextItineraryFormAfterCreate(current) {
  return {
    ...defaultItineraryForm,
    date: current.date || '',
    startTime: current.endTime || current.startTime || '',
    icon: current.icon || '📍',
    place: current.place || '',
  };
}

function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState(defaultAuthForm);
  const [passwordResetRequestForm, setPasswordResetRequestForm] = useState(
    defaultPasswordResetRequestForm,
  );
  const [passwordResetConfirmForm, setPasswordResetConfirmForm] = useState(
    defaultPasswordResetConfirmForm,
  );
  const [resetTokenFromUrl, setResetTokenFromUrl] = useState(() => readResetTokenFromUrl());
  const [inviteCodeFromUrl, setInviteCodeFromUrl] = useState(() => readInviteCodeFromUrl());
  const [issuedResetToken, setIssuedResetToken] = useState('');
  const [accountForm, setAccountForm] = useState(defaultAccountForm);

  const [userTrips, setUserTrips] = useState([]);
  const [workspace, setWorkspace] = useState(null);
  const [selectedTripId, setSelectedTripId] = useState('');
  const [activeTab, setActiveTab] = useState('itinerary');
  const [nowMs, setNowMs] = useState(() => Date.now());

  const [createForm, setCreateForm] = useState(defaultCreateForm);
  const [joinForm, setJoinForm] = useState(defaultJoinForm);
  const [itineraryForm, setItineraryForm] = useState(defaultItineraryForm);
  const [guideForm, setGuideForm] = useState(defaultGuideForm);
  const [selectedItineraryTemplate, setSelectedItineraryTemplate] = useState('move');
  const [selectedGuideTemplate, setSelectedGuideTemplate] = useState('overview');
  const [memoryForm, setMemoryForm] = useState(defaultMemoryForm);
  const [editingItineraryId, setEditingItineraryId] = useState('');
  const [itineraryEditForm, setItineraryEditForm] = useState(defaultItineraryForm);
  const [editingGuideId, setEditingGuideId] = useState('');
  const [guideEditForm, setGuideEditForm] = useState(defaultGuideForm);
  const [guideCreateDetailDraft, setGuideCreateDetailDraft] = useState(defaultGuideDetailDraft);
  const [guideDetailDraft, setGuideDetailDraft] = useState(defaultGuideDetailDraft);
  const [editingMemoryId, setEditingMemoryId] = useState('');
  const [memoryEditForm, setMemoryEditForm] = useState(defaultMemoryForm);
  const [memorySearchQuery, setMemorySearchQuery] = useState('');
  const [memorySearchResults, setMemorySearchResults] = useState([]);
  const [memorySearchSource, setMemorySearchSource] = useState('');
  const [memorySearchBusy, setMemorySearchBusy] = useState(false);
  const [designForm, setDesignForm] = useState(defaultDesignForm);
  const [draggingItemId, setDraggingItemId] = useState('');
  const [memoryFiles, setMemoryFiles] = useState([]);
  const [coverFile, setCoverFile] = useState(null);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const daySectionRefs = useRef({});

  const memberNameById = useMemo(() => {
    if (!workspace) {
      return {};
    }

    return Object.fromEntries(workspace.members.map((member) => [member.user_id, member.name]));
  }, [workspace]);
  const isGuestUser = Boolean(session?.user?.user_metadata?.is_guest);

  const currentTheme = useMemo(() => pickTheme(workspace?.trip), [workspace]);
  const itineraryStatus = useMemo(
    () => computeNowNextIds(workspace?.itineraryItems || [], nowMs),
    [workspace?.itineraryItems, nowMs],
  );
  const itineraryDaySections = useMemo(
    () => groupItemsByDay(workspace?.itineraryItems || []),
    [workspace?.itineraryItems],
  );
  const nowItem = useMemo(
    () => (workspace?.itineraryItems || []).find((entry) => entry.id === itineraryStatus.nowId) || null,
    [workspace?.itineraryItems, itineraryStatus.nowId],
  );
  const nextItem = useMemo(
    () => (workspace?.itineraryItems || []).find((entry) => entry.id === itineraryStatus.nextId) || null,
    [workspace?.itineraryItems, itineraryStatus.nextId],
  );

  const pageThemeStyle = useMemo(
    () => ({
      '--trip-primary': currentTheme.primaryColor,
      '--trip-accent': currentTheme.accentColor,
    }),
    [currentTheme],
  );

  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError && mounted) {
        setError(sessionError.message || 'セッションの確認に失敗しました。');
      }
      if (mounted) {
        setSession(data.session || null);
        setLoading(false);
      }
    };

    bootstrap();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession || null);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const syncResetToken = () => {
      setResetTokenFromUrl(readResetTokenFromUrl());
      setInviteCodeFromUrl(readInviteCodeFromUrl());
    };
    syncResetToken();
    window.addEventListener('popstate', syncResetToken);
    return () => {
      window.removeEventListener('popstate', syncResetToken);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 30 * 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const setSelectedTripPersisted = (userId, tripId) => {
    window.localStorage.setItem(storageKey(userId), tripId);
    setSelectedTripId(tripId);
  };

  const clearSelectedTripPersisted = (userId) => {
    window.localStorage.removeItem(storageKey(userId));
    setSelectedTripId('');
    setWorkspace(null);
    setActiveTab('itinerary');
  };

  const withBusy = async (task) => {
    setBusy(true);
    setError('');
    setInfo('');
    try {
      await task();
    } catch (err) {
      setError(err.message || '処理に失敗しました。');
    } finally {
      setBusy(false);
    }
  };

  const refreshTrips = async (userId) => {
    const trips = await listTripsForUser(userId);
    setUserTrips(trips);
    return trips;
  };

  const loadWorkspace = async (tripId) => {
    const retryWaits = [0, 400, 900, 1600, 2500];
    let lastError = null;

    for (const waitMs of retryWaits) {
      if (waitMs > 0) {
        await new Promise((resolve) => {
          window.setTimeout(resolve, waitMs);
        });
      }

      try {
        const nextWorkspace = await fetchTripWorkspace(tripId);
        setWorkspace(nextWorkspace);

        const theme = pickTheme(nextWorkspace.trip);
        setDesignForm({
          coverTitle: nextWorkspace.trip.cover_title || nextWorkspace.trip.name,
          coverSubtitle: nextWorkspace.trip.cover_subtitle || nextWorkspace.trip.destination,
          stampText: theme.stampText,
          primaryColor: theme.primaryColor,
          accentColor: theme.accentColor,
          backgroundStyle: theme.backgroundStyle,
          fontStyle: theme.fontStyle,
          layoutTemplate: theme.layoutTemplate || DEFAULT_THEME.layoutTemplate,
          pdfTemplate: theme.pdfTemplate || DEFAULT_THEME.pdfTemplate,
        });

        return nextWorkspace;
      } catch (err) {
        lastError = err;
      }
    }

    throw lastError || new Error('旅行情報の読み込みに失敗しました。');
  };

  const refreshWorkspace = async (silent = false) => {
    if (!selectedTripId) {
      return;
    }

    try {
      const next = await fetchTripWorkspace(selectedTripId);
      setWorkspace(next);
    } catch (err) {
      if (!silent) {
        setError(err.message || '旅行情報の更新に失敗しました。');
      }
    }
  };

  const refreshWorkspaceUntil = async (matcher = null) => {
    if (!selectedTripId) {
      return null;
    }

    const waits = [0, 300, 700, 1300, 2200, 3500, 5000, 7000];
    let latest = null;
    for (const wait of waits) {
      if (wait > 0) {
        await new Promise((resolve) => {
          window.setTimeout(resolve, wait);
        });
      }
      latest = await fetchTripWorkspace(selectedTripId);
      setWorkspace(latest);
      if (!matcher || matcher(latest)) {
        return latest;
      }
    }

    return latest;
  };

  useEffect(() => {
    const user = session?.user;
    if (!user) {
      setProfile(null);
      setUserTrips([]);
      setWorkspace(null);
      setSelectedTripId('');
      setAccountForm(defaultAccountForm);
      setIssuedResetToken('');
      setEditingItineraryId('');
      setEditingGuideId('');
      setGuideCreateDetailDraft(defaultGuideDetailDraft);
      setEditingMemoryId('');
      setMemorySearchQuery('');
      setMemorySearchResults([]);
      setMemorySearchSource('');
      return;
    }

    let cancelled = false;

    const initializeUserData = async () => {
      setLoading(true);
      try {
        const ensuredProfile = await ensureProfile(user);
        if (cancelled) {
          return;
        }
        setProfile(ensuredProfile);
        setAccountForm((prev) => ({
          ...prev,
          displayName: ensuredProfile.display_name || user.email || '',
          currentPassword: '',
          newPassword: '',
          confirmPassword: '',
        }));

        const trips = await refreshTrips(user.id);
        if (cancelled) {
          return;
        }

        const savedTripId = window.localStorage.getItem(storageKey(user.id));
        const canOpenSavedTrip = savedTripId && trips.some((trip) => trip.id === savedTripId);

        if (canOpenSavedTrip) {
          setSelectedTripId(savedTripId);
          await loadWorkspace(savedTripId);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || '初期データの読み込みに失敗しました。');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    initializeUserData();

    return () => {
      cancelled = true;
    };
  }, [session?.user]);

  useEffect(() => {
    if (!selectedTripId) {
      return undefined;
    }

    let timeout = null;
    const unsubscribe = subscribeTripChanges(selectedTripId, () => {
      if (timeout) {
        window.clearTimeout(timeout);
      }
      timeout = window.setTimeout(() => {
        fetchTripWorkspace(selectedTripId)
          .then((next) => {
            setWorkspace(next);
          })
          .catch(() => {});
      }, 250);
    });

    return () => {
      if (timeout) {
        window.clearTimeout(timeout);
      }
      unsubscribe();
    };
  }, [selectedTripId]);

  useEffect(() => {
    if (!inviteCodeFromUrl) {
      return;
    }

    setJoinForm((prev) => ({
      ...prev,
      code: inviteCodeFromUrl,
    }));
    setInfo('共有リンクの招待コードを入力しました。合言葉がある場合は入力して参加してください。');
    clearInviteInAddressBar();
  }, [inviteCodeFromUrl]);

  const handleAuthSubmit = (event) => {
    event.preventDefault();

    withBusy(async () => {
      if (authMode === 'signup') {
        const signUp = await supabase.auth.signUp({
          email: authForm.email,
          password: authForm.password,
          options: {
            data: {
              display_name: authForm.displayName,
            },
          },
        });

        if (signUp.error) {
          throw new Error(signUp.error.message || 'サインアップに失敗しました。');
        }

        if (signUp.data.user) {
          await ensureProfile(signUp.data.user, authForm.displayName);
        }

        if (!signUp.data.session) {
          setInfo('確認メールを送信しました。メール認証後にログインしてください。');
        } else {
          setInfo('アカウントを作成しました。');
        }
      } else {
        const signIn = await supabase.auth.signInWithPassword({
          email: authForm.email,
          password: authForm.password,
        });
        if (signIn.error) {
          throw new Error(signIn.error.message || 'ログインに失敗しました。');
        }
        setInfo('ログインしました。');
      }

      setAuthForm(defaultAuthForm);
    });
  };

  const handleStartAsGuest = () => {
    withBusy(async () => {
      const payload = await supabase.auth.signInGuest({
        displayName: authForm.displayName || '',
      });
      if (payload.error) {
        throw new Error(payload.error.message || 'ゲスト開始に失敗しました。');
      }
      setInfo('ゲストとして開始しました。招待コードで旅行に参加できます。');
    });
  };

  const handlePasswordResetRequest = (event) => {
    event.preventDefault();

    withBusy(async () => {
      const payload = await requestPasswordReset({
        email: passwordResetRequestForm.email,
        displayName: passwordResetRequestForm.displayName,
      });

      const token = String(payload?.resetToken || '');
      setIssuedResetToken(token);

      setPasswordResetRequestForm((prev) => ({
        ...defaultPasswordResetRequestForm,
        displayName: prev.displayName,
      }));

      if (token) {
        setPasswordResetConfirmForm((prev) => ({
          ...prev,
          manualToken: token,
        }));
      }

      setInfo(payload?.message || 'パスワード再設定の処理を受け付けました。');
    });
  };

  const clearResetTokenInAddressBar = () => {
    if (typeof window === 'undefined') {
      return;
    }
    const url = new URL(window.location.href);
    if (!url.searchParams.has('resetToken')) {
      return;
    }
    url.searchParams.delete('resetToken');
    const next = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState({}, '', next);
    setResetTokenFromUrl('');
  };

  const clearInviteInAddressBar = () => {
    if (typeof window === 'undefined') {
      return;
    }
    const url = new URL(window.location.href);
    if (!url.searchParams.has('invite')) {
      return;
    }
    url.searchParams.delete('invite');
    const next = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState({}, '', next);
    setInviteCodeFromUrl('');
  };

  const handlePasswordResetConfirm = (event) => {
    event.preventDefault();

    const token = resetTokenFromUrl || String(passwordResetConfirmForm.manualToken || '').trim();
    if (!token) {
      setError('再設定トークンがありません。メールリンクを開くか、再設定コードを入力してください。');
      return;
    }
    if (passwordResetConfirmForm.newPassword !== passwordResetConfirmForm.confirmPassword) {
      setError('新しいパスワード（確認）が一致しません。');
      return;
    }

    withBusy(async () => {
      const payload = await resetPassword({
        token,
        newPassword: passwordResetConfirmForm.newPassword,
      });

      const passwordSyncToken = String(payload?.passwordSyncToken || '');
      if (passwordSyncToken) {
        setPasswordSyncToken(passwordSyncToken);
      }

      setPasswordResetConfirmForm(defaultPasswordResetConfirmForm);
      setIssuedResetToken('');
      clearResetTokenInAddressBar();
      setInfo('パスワードを更新しました。新しいパスワードでログインしてください。');
    });
  };

  const handleAccountUpdate = (event) => {
    event.preventDefault();

    const hasDisplayName = Boolean(String(accountForm.displayName || '').trim());
    const hasPasswordUpdate = Boolean(accountForm.newPassword);

    if (!hasDisplayName) {
      setError('表示名は必須です。');
      return;
    }
    if (hasPasswordUpdate && accountForm.newPassword !== accountForm.confirmPassword) {
      setError('新しいパスワード（確認）が一致しません。');
      return;
    }

    withBusy(async () => {
      const payload = await supabase.auth.updateUser({
        displayName: accountForm.displayName.trim(),
        ...(hasPasswordUpdate
          ? {
              currentPassword: accountForm.currentPassword,
              newPassword: accountForm.newPassword,
            }
          : {}),
      });
      if (payload.error) {
        throw new Error(payload.error.message || 'アカウント更新に失敗しました。');
      }

      const nextDisplayName =
        payload.data.user?.user_metadata?.display_name || accountForm.displayName.trim();

      setProfile((prev) => ({
        ...(prev || {}),
        display_name: nextDisplayName,
      }));

      setAccountForm((prev) => ({
        ...prev,
        displayName: nextDisplayName,
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      }));
      setInfo('アカウント情報を更新しました。');
    });
  };

  const handleLogout = () => {
    withBusy(async () => {
      await supabase.auth.signOut();
      setInfo('ログアウトしました。');
      setWorkspace(null);
      setUserTrips([]);
      setSelectedTripId('');
      setProfile(null);
      setAccountForm(defaultAccountForm);
      setPasswordResetRequestForm(defaultPasswordResetRequestForm);
      setPasswordResetConfirmForm(defaultPasswordResetConfirmForm);
      setIssuedResetToken('');
      setEditingItineraryId('');
      setEditingGuideId('');
      setGuideCreateDetailDraft(defaultGuideDetailDraft);
      setEditingMemoryId('');
    });
  };

  const handleCreateTrip = (event) => {
    event.preventDefault();

    if (!session?.user) {
      return;
    }

    withBusy(async () => {
      const created = await createTripForUser(session.user.id, {
        ...createForm,
        theme: DEFAULT_THEME,
      });

      const nextTrips = await refreshTrips(session.user.id);
      if (!nextTrips.some((trip) => trip.id === created.id)) {
        throw new Error('旅行作成後の確認に失敗しました。');
      }

      setSelectedTripPersisted(session.user.id, created.id);
      await loadWorkspace(created.id);
      setCreateForm(defaultCreateForm);
      setInfo(`旅行を作成しました。招待コード: ${created.code}`);
    });
  };

  const handleJoinTrip = (event) => {
    event.preventDefault();

    if (!session?.user) {
      return;
    }

    withBusy(async () => {
      const joined = await joinTripByCode(session.user.id, joinForm.code, joinForm.passphrase);
      await refreshTrips(session.user.id);
      setSelectedTripPersisted(session.user.id, joined.id);
      await loadWorkspace(joined.id);
      setJoinForm(defaultJoinForm);
      setInfo('旅行に参加しました。');
    });
  };

  const handleOpenTrip = (tripId) => {
    if (!session?.user) {
      return;
    }

    withBusy(async () => {
      setSelectedTripPersisted(session.user.id, tripId);
      await loadWorkspace(tripId);
      setActiveTab('itinerary');
      setInfo('旅行ルームを開きました。');
    });
  };

  const handleLeaveWorkspace = () => {
    if (!session?.user) {
      return;
    }
    clearSelectedTripPersisted(session.user.id);
    setInfo('旅行一覧へ戻りました。');
  };

  const handleAddItinerary = (event) => {
    event.preventDefault();
    if (!workspace || !session?.user) {
      return;
    }

    withBusy(async () => {
      const beforeCount = workspace.itineraryItems.length;
      await addItineraryItem(workspace.trip.id, session.user.id, itineraryForm);
      setItineraryForm(nextItineraryFormAfterCreate(itineraryForm));
      await refreshWorkspaceUntil((next) => (next?.itineraryItems || []).length >= beforeCount + 1);
      setInfo('予定を追加しました。');
    });
  };

  const startEditItinerary = (item) => {
    setEditingItineraryId(item.id);
    setItineraryEditForm({
      date: item.date || '',
      startTime: item.start_time || '',
      endTime: item.end_time || '',
      title: item.title || '',
      place: item.place || '',
      linkUrl: item.link_url || '',
      icon: item.icon || '📍',
      notes: item.notes || '',
    });
  };

  const cancelEditItinerary = () => {
    setEditingItineraryId('');
    setItineraryEditForm(defaultItineraryForm);
  };

  const saveEditItinerary = (event, itemId) => {
    event.preventDefault();
    withBusy(async () => {
      await updateItineraryItem(itemId, itineraryEditForm);
      await refreshWorkspaceUntil((next) =>
        (next?.itineraryItems || []).some((entry) => entry.id === itemId && entry.title === itineraryEditForm.title),
      );
      cancelEditItinerary();
      setInfo('予定を更新しました。');
    });
  };

  const handleDeleteItinerary = (itemId) => {
    if (!window.confirm('この予定を削除しますか？')) {
      return;
    }

    withBusy(async () => {
      const beforeCount = workspace?.itineraryItems?.length || 0;
      await deleteItineraryItem(itemId);
      await refreshWorkspaceUntil((next) => (next?.itineraryItems || []).length <= Math.max(0, beforeCount - 1));
      setInfo('予定を削除しました。');
    });
  };

  const handleReorderItineraryByIds = (itemIds) => {
    if (!workspace) {
      return;
    }
    withBusy(async () => {
      const itemById = Object.fromEntries(workspace.itineraryItems.map((entry) => [entry.id, entry]));
      const optimisticItems = itemIds.map((id) => itemById[id]).filter(Boolean);
      if (optimisticItems.length === workspace.itineraryItems.length) {
        setWorkspace((prev) =>
          prev
            ? {
                ...prev,
                itineraryItems: optimisticItems,
              }
            : prev,
        );
      }

      await reorderItineraryItems(workspace.trip.id, itemIds);
      await refreshWorkspaceUntil((next) => {
        const ids = (next?.itineraryItems || []).map((entry) => entry.id);
        return ids.length === itemIds.length && ids.join(',') === itemIds.join(',');
      });
      setInfo('行程の順番を更新しました。');
    });
  };

  const handleMoveItinerary = (itemId, direction) => {
    if (!workspace) {
      return;
    }
    const ids = workspace.itineraryItems.map((entry) => entry.id);
    const from = ids.indexOf(itemId);
    if (from < 0) {
      return;
    }
    const to = from + direction;
    if (to < 0 || to >= ids.length) {
      return;
    }
    const next = [...ids];
    const [picked] = next.splice(from, 1);
    next.splice(to, 0, picked);
    handleReorderItineraryByIds(next);
  };

  const handleDropItineraryOn = (targetId) => {
    if (!workspace || !draggingItemId || draggingItemId === targetId) {
      setDraggingItemId('');
      return;
    }

    const ids = workspace.itineraryItems.map((entry) => entry.id);
    const from = ids.indexOf(draggingItemId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) {
      setDraggingItemId('');
      return;
    }

    const next = [...ids];
    const [picked] = next.splice(from, 1);
    next.splice(to, 0, picked);
    setDraggingItemId('');
    handleReorderItineraryByIds(next);
  };

  const scrollToDaySection = (key) => {
    const node = daySectionRefs.current[key];
    if (!node) {
      return;
    }
    node.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleAddGuide = (event) => {
    event.preventDefault();
    if (!workspace) {
      return;
    }

    withBusy(async () => {
      await addGuideSection(workspace.trip.id, guideForm);
      setGuideForm(defaultGuideForm);
      setGuideCreateDetailDraft(defaultGuideDetailDraft);
      await refreshWorkspace();
      setInfo('しおりセクションを追加しました。');
    });
  };

  const applyGuideTemplateToForm = (templateKey = selectedGuideTemplate) => {
    const found = GUIDE_TEMPLATE_OPTIONS.find((entry) => entry.key === templateKey);
    if (!found) {
      setError('テンプレートが見つかりませんでした。');
      return;
    }

    const template = found.apply();
    setGuideForm((prev) => ({
      ...prev,
      title: template.title,
      content: template.content,
      variant: template.variant,
      emoji: template.emoji,
      details: hydrateTemplateDetails(template.details),
    }));
    setGuideCreateDetailDraft(defaultGuideDetailDraft);
    setInfo(`${found.label}テンプレートを適用しました。`);
  };

  const applyOverviewTemplateToGuideForm = () => {
    setSelectedGuideTemplate('overview');
    applyGuideTemplateToForm('overview');
  };

  const applyItineraryQuickTemplate = (templateKey = selectedItineraryTemplate) => {
    const preset = ITINERARY_QUICK_TEMPLATE_OPTIONS.find((entry) => entry.key === templateKey);
    if (!preset) {
      setError('行程テンプレートが見つかりませんでした。');
      return;
    }

    setItineraryForm((prev) => ({
      ...prev,
      title: preset.title,
      icon: preset.icon,
      notes: prev.notes ? prev.notes : preset.notes,
    }));
    setInfo(`${preset.label}テンプレートを入力欄へ反映しました。`);
  };

  const updateGuideFormDetailAt = (index, key, value) => {
    setGuideForm((prev) => {
      const nextDetails = [...(prev.details || [])];
      const current = nextDetails[index] || { id: newClientId('detail'), label: '', value: '' };
      nextDetails[index] = {
        ...current,
        [key]: value,
      };
      return {
        ...prev,
        details: nextDetails,
      };
    });
  };

  const removeGuideFormDetailAt = (index) => {
    setGuideForm((prev) => ({
      ...prev,
      details: (prev.details || []).filter((_, idx) => idx !== index),
    }));
  };

  const addGuideDetailToForm = () => {
    const label = String(guideCreateDetailDraft.label || '').trim();
    const value = String(guideCreateDetailDraft.value || '').trim();
    if (!label && !value) {
      setError('追加する項目名か内容を入力してください。');
      return;
    }

    setGuideForm((prev) => ({
      ...prev,
      details: [
        ...(prev.details || []),
        {
          id: newClientId('detail'),
          label: label || '項目',
          value,
        },
      ],
    }));
    setGuideCreateDetailDraft(defaultGuideDetailDraft);
  };

  const startEditGuide = (section) => {
    const style = normalizeGuideStyle(section.style);
    setEditingGuideId(section.id);
    setGuideEditForm({
      title: section.title || '',
      content: section.content || '',
      variant: style.variant,
      emoji: style.emoji,
      details: style.details,
    });
    setGuideDetailDraft(defaultGuideDetailDraft);
  };

  const cancelEditGuide = () => {
    setEditingGuideId('');
    setGuideEditForm(defaultGuideForm);
    setGuideDetailDraft(defaultGuideDetailDraft);
  };

  const saveEditGuide = (event, sectionId) => {
    event.preventDefault();
    withBusy(async () => {
      await updateGuideSection(sectionId, {
        title: guideEditForm.title,
        content: guideEditForm.content,
        style: {
          variant: guideEditForm.variant,
          emoji: guideEditForm.emoji,
          details: guideEditForm.details || [],
        },
      });
      await refreshWorkspace();
      cancelEditGuide();
      setInfo('しおりを更新しました。');
    });
  };

  const updateGuideDetailAt = (index, key, value) => {
    setGuideEditForm((prev) => {
      const nextDetails = [...(prev.details || [])];
      const current = nextDetails[index] || { id: newClientId('detail'), label: '', value: '' };
      nextDetails[index] = {
        ...current,
        [key]: value,
      };
      return {
        ...prev,
        details: nextDetails,
      };
    });
  };

  const removeGuideDetailAt = (index) => {
    setGuideEditForm((prev) => ({
      ...prev,
      details: (prev.details || []).filter((_, idx) => idx !== index),
    }));
  };

  const addGuideDetailToEdit = () => {
    const label = String(guideDetailDraft.label || '').trim();
    const value = String(guideDetailDraft.value || '').trim();
    if (!label && !value) {
      setError('追加する項目名か内容を入力してください。');
      return;
    }
    setGuideEditForm((prev) => ({
      ...prev,
      details: [
        ...(prev.details || []),
        {
          id: newClientId('detail'),
          label: label || '項目',
          value,
        },
      ],
    }));
    setGuideDetailDraft(defaultGuideDetailDraft);
  };

  const handleDeleteGuide = (sectionId) => {
    if (!window.confirm('このセクションを削除しますか？')) {
      return;
    }

    withBusy(async () => {
      await deleteGuideSection(sectionId);
      await refreshWorkspace();
      setInfo('しおりセクションを削除しました。');
    });
  };

  const handleAddMemory = (event) => {
    event.preventDefault();
    if (!workspace || !session?.user) {
      return;
    }

    withBusy(async () => {
      await addMemory(workspace.trip.id, session.user.id, memoryForm, memoryFiles);
      setMemoryForm(defaultMemoryForm);
      setMemoryFiles([]);
      await refreshWorkspace();
      setInfo('思い出を追加しました。');
    });
  };

  const startEditMemory = (memory) => {
    setEditingMemoryId(memory.id);
    setMemoryEditForm({
      date: memory.date || '',
      title: memory.title || '',
      content: memory.content || '',
    });
  };

  const cancelEditMemory = () => {
    setEditingMemoryId('');
    setMemoryEditForm(defaultMemoryForm);
  };

  const saveEditMemory = (event, memoryId) => {
    event.preventDefault();
    withBusy(async () => {
      await updateMemory(memoryId, memoryEditForm);
      await refreshWorkspace();
      cancelEditMemory();
      setInfo('思い出を更新しました。');
    });
  };

  const handleDeleteMemory = (memory) => {
    if (!window.confirm('この思い出を削除しますか？')) {
      return;
    }

    withBusy(async () => {
      await deleteMemory(memory);
      await refreshWorkspace();
      setInfo('思い出を削除しました。');
    });
  };

  const runMemorySimilaritySearch = async (input = {}) => {
    if (!workspace) {
      return;
    }

    const query = String(input.query || '').trim();
    const memoryId = String(input.memoryId || '').trim();
    if (!query && !memoryId) {
      setError('検索キーワードか対象の思い出を指定してください。');
      return;
    }

    setMemorySearchBusy(true);
    setError('');
    try {
      const payload = await findSimilarMemories(workspace.trip.id, {
        query,
        memoryId,
        topK: 6,
      });

      const rows = Array.isArray(payload?.results) ? payload.results : [];
      const source = String(payload?.source || '');
      setMemorySearchResults(rows);
      setMemorySearchSource(source);
      if (rows.length === 0) {
        setInfo('類似する思い出は見つかりませんでした。');
      } else {
        setInfo(
          source === 'pinecone'
            ? 'AI類似検索の結果を表示しています。'
            : 'キーワード類似検索の結果を表示しています。',
        );
      }
    } catch (err) {
      setError(err.message || '類似検索に失敗しました。');
    } finally {
      setMemorySearchBusy(false);
    }
  };

  const handleMemorySearch = (event) => {
    event.preventDefault();
    runMemorySimilaritySearch({ query: memorySearchQuery });
  };

  const handleMemorySearchFromEntry = (memoryId) => {
    runMemorySimilaritySearch({ memoryId });
  };

  const handleSaveDesign = (event) => {
    event.preventDefault();
    if (!workspace) {
      return;
    }

    withBusy(async () => {
      await updateTripDesign(workspace.trip.id, {
        coverTitle: designForm.coverTitle,
        coverSubtitle: designForm.coverSubtitle,
        theme: {
          primaryColor: designForm.primaryColor,
          accentColor: designForm.accentColor,
          backgroundStyle: designForm.backgroundStyle,
          fontStyle: designForm.fontStyle,
          stampText: designForm.stampText,
          layoutTemplate: designForm.layoutTemplate,
          pdfTemplate: designForm.pdfTemplate,
        },
      });
      await refreshWorkspace();
      if (session?.user) {
        await refreshTrips(session.user.id);
      }
      setInfo('しおりデザインを保存しました。');
    });
  };

  const handleUploadCover = () => {
    if (!workspace || !coverFile) {
      setError('先に表紙画像ファイルを選択してください。');
      return;
    }

    withBusy(async () => {
      await uploadTripCover(workspace.trip.id, coverFile, workspace.trip.cover_image_path || '');
      setCoverFile(null);
      await refreshWorkspace();
      if (session?.user) {
        await refreshTrips(session.user.id);
      }
      setInfo('表紙画像を更新しました。');
    });
  };

  const handleCopyInviteCode = async () => {
    if (!workspace?.trip?.code) {
      return;
    }

    try {
      await navigator.clipboard.writeText(workspace.trip.code);
      setInfo('招待コードをコピーしました。');
    } catch {
      setError('クリップボードへのコピーに失敗しました。');
    }
  };

  const handleCopyShareLink = async () => {
    if (!workspace?.trip?.code) {
      return;
    }
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('invite', workspace.trip.code);
      await navigator.clipboard.writeText(url.toString());
      setInfo('共有リンクをコピーしました。');
    } catch {
      setError('共有リンクのコピーに失敗しました。');
    }
  };

  const applyDesignPreset = (presetKey) => {
    const preset = DESIGN_PRESETS[presetKey];
    if (!preset) {
      return;
    }
    setDesignForm((prev) => ({
      ...prev,
      ...preset,
    }));
  };

  const handleExportGuide = () => {
    if (!workspace) {
      return;
    }
    try {
      exportGuidePdf(workspace, memberNameById);
    } catch (err) {
      setError(err.message || 'しおりPDFの出力に失敗しました。');
    }
  };

  const handleExportMemories = () => {
    if (!workspace) {
      return;
    }
    try {
      exportMemoriesPdf(workspace, memberNameById);
    } catch (err) {
      setError(err.message || '思い出PDFの出力に失敗しました。');
    }
  };

  if (loading) {
    return (
      <main className="page shell" style={pageThemeStyle}>
        <p className="status">読み込み中...</p>
      </main>
    );
  }

  if (!isSupabaseConfigured) {
    return (
      <main className="page" style={pageThemeStyle}>
        <header className="hero">
          <p className="eyebrow">Supabase Setup Required</p>
          <h1>環境変数の設定が必要です</h1>
          <p>
            Vercel または `web/.env` に `VITE_SUPABASE_URL` と `VITE_SUPABASE_ANON_KEY` を設定してください。
            設定後に再読み込みすると、ログイン認証と画像アップロードが有効になります。
          </p>
        </header>
      </main>
    );
  }

  if (!session?.user) {
    return (
      <main className="page" style={pageThemeStyle}>
        <header className="hero">
          <p className="eyebrow">足袋navi</p>
          <h1>足袋navi（タビナビ）</h1>
          <p>
            ゲスト開始（会員登録なし）でも、招待コードと合言葉で参加できます。写真はファイルアップロード、しおりはデコレーション編集、PDF出力まで対応しています。
          </p>
        </header>

        <section className="auth-grid one-col">
          <article className="panel">
            <div className="switch-row">
              <button
                type="button"
                className={authMode === 'login' ? 'active small-tab' : 'small-tab'}
                onClick={() => setAuthMode('login')}
              >
                ログイン
              </button>
              <button
                type="button"
                className={authMode === 'signup' ? 'active small-tab' : 'small-tab'}
                onClick={() => setAuthMode('signup')}
              >
                サインアップ
              </button>
            </div>

            <form className="form" onSubmit={handleAuthSubmit}>
              {authMode === 'signup' ? (
                <label>
                  表示名
                  <input
                    required
                    value={authForm.displayName}
                    onChange={(event) =>
                      setAuthForm((prev) => ({ ...prev, displayName: event.target.value }))
                    }
                    placeholder="例: sample"
                  />
                </label>
              ) : null}

              <label>
                メールアドレス
                <input
                  type="email"
                  required
                  value={authForm.email}
                  onChange={(event) => setAuthForm((prev) => ({ ...prev, email: event.target.value }))}
                  placeholder="you@example.com"
                />
              </label>

              <label>
                パスワード
                <input
                  type="password"
                  required
                  minLength={8}
                  value={authForm.password}
                  onChange={(event) =>
                    setAuthForm((prev) => ({ ...prev, password: event.target.value }))
                  }
                />
              </label>

              {authMode === 'login' ? (
                <label>
                  ゲスト表示名（任意）
                  <input
                    value={authForm.displayName}
                    onChange={(event) =>
                      setAuthForm((prev) => ({ ...prev, displayName: event.target.value }))
                    }
                    placeholder="例: sample"
                  />
                </label>
              ) : null}

              <button type="submit" disabled={busy}>
                {authMode === 'signup' ? 'アカウント作成' : 'ログイン'}
              </button>
              {authMode === 'login' ? (
                <button type="button" className="secondary" disabled={busy} onClick={handleStartAsGuest}>
                  会員登録せずに始める（ゲスト）
                </button>
              ) : null}
            </form>

            <div className="auth-subsection">
              <h3>パスワードを忘れた場合</h3>
              <p className="placeholder">
                メール設定済みなら再設定メール、未設定なら表示名一致で再設定コードを発行します。
              </p>

              <form className="form" onSubmit={handlePasswordResetRequest}>
                <label>
                  再設定したいメールアドレス
                  <input
                    type="email"
                    required
                    value={passwordResetRequestForm.email}
                    onChange={(event) =>
                      setPasswordResetRequestForm((prev) => ({ ...prev, email: event.target.value }))
                    }
                    placeholder="you@example.com"
                  />
                </label>
                <label>
                  表示名（メール未設定時の確認用）
                  <input
                    value={passwordResetRequestForm.displayName}
                    onChange={(event) =>
                      setPasswordResetRequestForm((prev) => ({
                        ...prev,
                        displayName: event.target.value,
                      }))
                    }
                    placeholder="例: sample"
                  />
                </label>
                <button type="submit" className="secondary" disabled={busy}>
                  再設定リンク/コードを発行
                </button>
              </form>

              {issuedResetToken ? (
                <p className="status info mini">
                  メール未設定モード: 再設定コード `{issuedResetToken}` を発行しました。
                </p>
              ) : null}

              {resetTokenFromUrl || issuedResetToken ? (
                <form className="form" onSubmit={handlePasswordResetConfirm}>
                  {resetTokenFromUrl ? (
                    <p className="status info mini">メールリンクを確認しました。新しいパスワードを入力してください。</p>
                  ) : null}
                  {!resetTokenFromUrl ? (
                    <label>
                      再設定コード
                      <input
                        required
                        value={passwordResetConfirmForm.manualToken}
                        onChange={(event) =>
                          setPasswordResetConfirmForm((prev) => ({
                            ...prev,
                            manualToken: event.target.value,
                          }))
                        }
                        placeholder="発行されたコード"
                      />
                    </label>
                  ) : null}
                  <label>
                    新しいパスワード
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={passwordResetConfirmForm.newPassword}
                      onChange={(event) =>
                        setPasswordResetConfirmForm((prev) => ({
                          ...prev,
                          newPassword: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label>
                    新しいパスワード（確認）
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={passwordResetConfirmForm.confirmPassword}
                      onChange={(event) =>
                        setPasswordResetConfirmForm((prev) => ({
                          ...prev,
                          confirmPassword: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <button type="submit" className="secondary" disabled={busy}>
                    パスワードを更新
                  </button>
                </form>
              ) : (
                <p className="placeholder">
                  再設定コード発行後、またはメール内リンクを開いた後に、ここでパスワードを更新できます。
                </p>
              )}
            </div>
          </article>
        </section>

        {error ? <p className="status error">{error}</p> : null}
        {info ? <p className="status info">{info}</p> : null}
      </main>
    );
  }

  return (
    <main className="page shell" style={pageThemeStyle}>
      <header className="trip-head">
        <div>
          <p className="eyebrow">足袋navi</p>
          <h1>{profile?.display_name || session.user.email}</h1>
          <p>旅行ルームを選択すると共同編集できます。</p>
        </div>

        <div className="head-actions">
          <button type="button" className="secondary" onClick={handleLogout}>
            ログアウト
          </button>
        </div>
      </header>

      <section className="workspace-grid">
        <aside className="panel side-panel">
          <h2>あなたの旅行</h2>
          <div className="trip-list">
            {userTrips.length === 0 ? (
              <p className="placeholder">参加中の旅行がありません。</p>
            ) : (
              userTrips.map((trip) => (
                <button
                  key={trip.id}
                  type="button"
                  className={selectedTripId === trip.id ? 'trip-chip active-chip' : 'trip-chip'}
                  onClick={() => handleOpenTrip(trip.id)}
                >
                  <strong>{trip.name}</strong>
                  <span>{trip.destination}</span>
                  <span>コード: {trip.code}</span>
                  {trip.requires_passphrase ? <span>🔐 合言葉あり</span> : null}
                </button>
              ))
            )}
          </div>

          <h3>新しい旅行を作成</h3>
          <form className="form" onSubmit={handleCreateTrip}>
            <label>
              旅行名
              <input
                required
                value={createForm.name}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, name: event.target.value }))}
              />
            </label>

            <label>
              目的地
              <input
                required
                value={createForm.destination}
                onChange={(event) =>
                  setCreateForm((prev) => ({ ...prev, destination: event.target.value }))
                }
              />
            </label>

            <div className="row two-col">
              <label>
                開始日
                <input
                  type="date"
                  value={createForm.startDate}
                  onChange={(event) =>
                    setCreateForm((prev) => ({ ...prev, startDate: event.target.value }))
                  }
                />
              </label>
              <label>
                終了日
                <input
                  type="date"
                  value={createForm.endDate}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, endDate: event.target.value }))}
                />
              </label>
            </div>

            <label>
              合言葉（任意）
              <input
                value={createForm.passphrase}
                onChange={(event) =>
                  setCreateForm((prev) => ({ ...prev, passphrase: event.target.value }))
                }
                placeholder="設定すると参加時に必要になります"
              />
            </label>

            <button type="submit" disabled={busy}>
              旅行を作成
            </button>
          </form>

          <h3>招待コードで参加</h3>
          <p className="placeholder">共有リンクを開くと、ここに招待コードが自動入力されます。</p>
          <form className="form" onSubmit={handleJoinTrip}>
            <label>
              招待コード
              <input
                required
                value={joinForm.code}
                onChange={(event) =>
                  setJoinForm((prev) => ({ ...prev, code: event.target.value.toUpperCase() }))
                }
                placeholder="A9K2QX"
              />
            </label>

            <label>
              合言葉（設定されている場合）
              <input
                value={joinForm.passphrase}
                onChange={(event) =>
                  setJoinForm((prev) => ({ ...prev, passphrase: event.target.value }))
                }
                placeholder="合言葉"
              />
            </label>

            <button type="submit" disabled={busy}>
              参加する
            </button>
          </form>

          <details className="account-panel" open>
            <summary>{isGuestUser ? 'アカウント設定（表示名）' : 'アカウント設定（名前・パスワード）'}</summary>
            <form className="form" onSubmit={handleAccountUpdate}>
              <label>
                表示名
                <input
                  required
                  value={accountForm.displayName}
                  onChange={(event) =>
                    setAccountForm((prev) => ({ ...prev, displayName: event.target.value }))
                  }
                />
              </label>
              {!isGuestUser ? (
                <label>
                  現在のパスワード（変更時のみ）
                  <input
                    type="password"
                    value={accountForm.currentPassword}
                    onChange={(event) =>
                      setAccountForm((prev) => ({ ...prev, currentPassword: event.target.value }))
                    }
                    placeholder="パスワード変更しないなら空欄"
                  />
                </label>
              ) : null}
              {!isGuestUser ? (
                <label>
                  新しいパスワード（変更時のみ）
                  <input
                    type="password"
                    minLength={8}
                    value={accountForm.newPassword}
                    onChange={(event) =>
                      setAccountForm((prev) => ({ ...prev, newPassword: event.target.value }))
                    }
                    placeholder="8文字以上"
                  />
                </label>
              ) : null}
              {!isGuestUser ? (
                <label>
                  新しいパスワード（確認）
                  <input
                    type="password"
                    minLength={8}
                    value={accountForm.confirmPassword}
                    onChange={(event) =>
                      setAccountForm((prev) => ({ ...prev, confirmPassword: event.target.value }))
                    }
                    placeholder="新しいパスワードを再入力"
                  />
                </label>
              ) : null}
              <button type="submit" className="secondary" disabled={busy}>
                アカウントを更新
              </button>
            </form>
          </details>

        </aside>

        <section className={`panel main-panel layout-${currentTheme.layoutTemplate || DEFAULT_THEME.layoutTemplate}`}>
          {!workspace ? (
            <div className="empty-state">
              <h2>旅行ルームを選択してください</h2>
              <p>左側から既存旅行を開くか、新規作成/招待コードで参加してください。</p>
            </div>
          ) : (
            <>
              <header className={`decor-cover ${backgroundClass(currentTheme.backgroundStyle)}`}>
                {workspace.trip.cover_image_url ? (
                  <img className="decor-cover-image" src={workspace.trip.cover_image_url} alt="cover" />
                ) : null}
                <div className="decor-overlay">
                  <span className="stamp">{currentTheme.stampText}</span>
                  <h2>{workspace.trip.cover_title || workspace.trip.name}</h2>
                  <p>{workspace.trip.cover_subtitle || workspace.trip.destination}</p>
                  <p>
                    {formatDateText(workspace.trip.start_date)} 〜 {formatDateText(workspace.trip.end_date)}
                  </p>
                  {workspace.trip.requires_passphrase ? <p>🔐 合言葉で編集保護中</p> : null}
                  <div className="row-buttons">
                    <button type="button" onClick={handleCopyInviteCode}>
                      コード: {workspace.trip.code}
                    </button>
                    <button type="button" className="secondary" onClick={handleCopyShareLink}>
                      共有リンク
                    </button>
                    <button type="button" onClick={handleExportGuide}>
                      しおりPDF
                    </button>
                    <button type="button" onClick={handleExportMemories}>
                      思い出PDF
                    </button>
                    <button type="button" className="secondary" onClick={handleLeaveWorkspace}>
                      一覧へ戻る
                    </button>
                  </div>
                </div>
              </header>

              <nav className="tabs">
                <button
                  type="button"
                  className={activeTab === 'itinerary' ? 'active' : ''}
                  onClick={() => setActiveTab('itinerary')}
                >
                  計画
                </button>
                <button
                  type="button"
                  className={activeTab === 'guide' ? 'active' : ''}
                  onClick={() => setActiveTab('guide')}
                >
                  しおり
                </button>
                <button
                  type="button"
                  className={activeTab === 'memories' ? 'active' : ''}
                  onClick={() => setActiveTab('memories')}
                >
                  思い出
                </button>
                <button
                  type="button"
                  className={activeTab === 'design' ? 'active' : ''}
                  onClick={() => setActiveTab('design')}
                >
                  デザイン
                </button>
              </nav>

              {activeTab === 'itinerary' ? (
                <section className="content-panel">
                  <h2>旅の予定を共有する</h2>
                  <div className="quick-template-panel">
                    <label>
                      クイック入力テンプレート
                      <select
                        value={selectedItineraryTemplate}
                        onChange={(event) => setSelectedItineraryTemplate(event.target.value)}
                      >
                        {ITINERARY_QUICK_TEMPLATE_OPTIONS.map((entry) => (
                          <option key={entry.key} value={entry.key}>
                            {entry.icon} {entry.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button type="button" className="secondary" onClick={() => applyItineraryQuickTemplate()}>
                      テンプレートを反映
                    </button>
                  </div>
                  <form className="form" onSubmit={handleAddItinerary}>
                    <div className="row">
                      <label>
                        日付
                        <input
                          type="date"
                          value={itineraryForm.date}
                          onChange={(event) =>
                            setItineraryForm((prev) => ({ ...prev, date: event.target.value }))
                          }
                        />
                      </label>
                      <label>
                        開始
                        <input
                          type="time"
                          value={itineraryForm.startTime}
                          onChange={(event) =>
                            setItineraryForm((prev) => ({ ...prev, startTime: event.target.value }))
                          }
                        />
                      </label>
                      <label>
                        終了
                        <input
                          type="time"
                          value={itineraryForm.endTime}
                          onChange={(event) =>
                            setItineraryForm((prev) => ({ ...prev, endTime: event.target.value }))
                          }
                        />
                      </label>
                    </div>

                    <label>
                      予定タイトル
                      <input
                        required
                        value={itineraryForm.title}
                        onChange={(event) =>
                          setItineraryForm((prev) => ({ ...prev, title: event.target.value }))
                        }
                      />
                    </label>

                    <label>
                      場所
                      <input
                        value={itineraryForm.place}
                        onChange={(event) =>
                          setItineraryForm((prev) => ({ ...prev, place: event.target.value }))
                        }
                      />
                    </label>

                    <div className="row two-col">
                      <label>
                        アイコン
                        <select
                          value={itineraryForm.icon}
                          onChange={(event) =>
                            setItineraryForm((prev) => ({ ...prev, icon: event.target.value }))
                          }
                        >
                          {ITINERARY_ICON_OPTIONS.map((entry) => (
                            <option key={entry.value} value={entry.value}>
                              {entry.value} {entry.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label>
                        場所URL（任意）
                        <input
                          type="url"
                          value={itineraryForm.linkUrl}
                          onChange={(event) =>
                            setItineraryForm((prev) => ({ ...prev, linkUrl: event.target.value }))
                          }
                          placeholder="https://maps.google.com/..."
                        />
                      </label>
                    </div>

                    <label>
                      メモ
                      <textarea
                        rows={3}
                        value={itineraryForm.notes}
                        onChange={(event) =>
                          setItineraryForm((prev) => ({ ...prev, notes: event.target.value }))
                        }
                      />
                    </label>

                    <button type="submit" disabled={busy}>
                      予定を追加
                    </button>
                  </form>

                  {nowItem || nextItem ? (
                    <p className="status info mini">
                      {nowItem
                        ? `いまの予定: ${nowItem.icon || '📍'} ${nowItem.title}`
                        : nextItem
                          ? `つぎの予定: ${nextItem.icon || '📍'} ${nextItem.title} (${nextItem.start_time || '--:--'})`
                          : ''}
                    </p>
                  ) : null}

                  {itineraryDaySections.length > 1 ? (
                    <div className="day-jump-bar">
                      {itineraryDaySections.map((section) => (
                        <button
                          key={section.key}
                          type="button"
                          className="day-jump-chip secondary"
                          onClick={() => scrollToDaySection(section.key)}
                        >
                          {section.label}
                        </button>
                      ))}
                    </div>
                  ) : null}

                  <div className="list">
                    {workspace.itineraryItems.length === 0 ? (
                      <p className="placeholder">まだ予定がありません。</p>
                    ) : (
                      itineraryDaySections.map((section) => (
                        <section
                          key={section.key}
                          className="day-section"
                          ref={(node) => {
                            daySectionRefs.current[section.key] = node;
                          }}
                        >
                          <header className="day-section-head">
                            <h3>
                              {section.label}
                              <span>{section.title}</span>
                            </h3>
                          </header>

                          <div className="list">
                            {section.items.map((item) => (
                              <article
                                className={`card itinerary-card ${draggingItemId === item.id ? 'dragging' : ''}`}
                                key={item.id}
                                draggable={editingItineraryId !== item.id}
                                onDragStart={() => setDraggingItemId(item.id)}
                                onDragEnd={() => setDraggingItemId('')}
                                onDragOver={(event) => event.preventDefault()}
                                onDrop={() => handleDropItineraryOn(item.id)}
                              >
                                <div className="card-head">
                                  <h3>
                                    {item.icon || '📍'} {item.title}
                                    {itineraryStatus.nowId === item.id ? (
                                      <span className="badge now">NOW</span>
                                    ) : null}
                                    {itineraryStatus.nextId === item.id ? (
                                      <span className="badge next">NEXT</span>
                                    ) : null}
                                  </h3>
                                  <div className="row-buttons">
                                    <button
                                      type="button"
                                      className="secondary"
                                      onClick={() => handleMoveItinerary(item.id, -1)}
                                    >
                                      ↑
                                    </button>
                                    <button
                                      type="button"
                                      className="secondary"
                                      onClick={() => handleMoveItinerary(item.id, 1)}
                                    >
                                      ↓
                                    </button>
                                    {editingItineraryId !== item.id ? (
                                      <button type="button" onClick={() => startEditItinerary(item)}>
                                        編集
                                      </button>
                                    ) : null}
                                    <button
                                      type="button"
                                      className="danger"
                                      onClick={() => handleDeleteItinerary(item.id)}
                                    >
                                      削除
                                    </button>
                                  </div>
                                </div>
                                <p>
                                  {formatDateText(item.date)} {item.start_time || '--:--'} - {item.end_time || '--:--'}
                                </p>
                                <p>場所: {item.place || '未設定'}</p>
                                {item.link_url ? (
                                  <p>
                                    リンク:{' '}
                                    <a href={item.link_url} target="_blank" rel="noreferrer">
                                      {item.link_url}
                                    </a>
                                  </p>
                                ) : null}
                                <p>担当: {memberNameById[item.owner_user_id] || '未設定'}</p>
                                {item.notes ? <p className="note">{item.notes}</p> : null}

                                {editingItineraryId === item.id ? (
                                  <form className="form edit-form" onSubmit={(event) => saveEditItinerary(event, item.id)}>
                                    <div className="row">
                                      <label>
                                        日付
                                        <input
                                          type="date"
                                          value={itineraryEditForm.date}
                                          onChange={(event) =>
                                            setItineraryEditForm((prev) => ({ ...prev, date: event.target.value }))
                                          }
                                        />
                                      </label>
                                      <label>
                                        開始
                                        <input
                                          type="time"
                                          value={itineraryEditForm.startTime}
                                          onChange={(event) =>
                                            setItineraryEditForm((prev) => ({
                                              ...prev,
                                              startTime: event.target.value,
                                            }))
                                          }
                                        />
                                      </label>
                                      <label>
                                        終了
                                        <input
                                          type="time"
                                          value={itineraryEditForm.endTime}
                                          onChange={(event) =>
                                            setItineraryEditForm((prev) => ({ ...prev, endTime: event.target.value }))
                                          }
                                        />
                                      </label>
                                    </div>
                                    <label>
                                      予定タイトル
                                      <input
                                        required
                                        value={itineraryEditForm.title}
                                        onChange={(event) =>
                                          setItineraryEditForm((prev) => ({ ...prev, title: event.target.value }))
                                        }
                                      />
                                    </label>
                                    <label>
                                      場所
                                      <input
                                        value={itineraryEditForm.place}
                                        onChange={(event) =>
                                          setItineraryEditForm((prev) => ({ ...prev, place: event.target.value }))
                                        }
                                      />
                                    </label>
                                    <div className="row two-col">
                                      <label>
                                        アイコン
                                        <select
                                          value={itineraryEditForm.icon}
                                          onChange={(event) =>
                                            setItineraryEditForm((prev) => ({ ...prev, icon: event.target.value }))
                                          }
                                        >
                                          {ITINERARY_ICON_OPTIONS.map((entry) => (
                                            <option key={entry.value} value={entry.value}>
                                              {entry.value} {entry.label}
                                            </option>
                                          ))}
                                        </select>
                                      </label>
                                      <label>
                                        場所URL（任意）
                                        <input
                                          type="url"
                                          value={itineraryEditForm.linkUrl}
                                          onChange={(event) =>
                                            setItineraryEditForm((prev) => ({ ...prev, linkUrl: event.target.value }))
                                          }
                                        />
                                      </label>
                                    </div>
                                    <label>
                                      メモ
                                      <textarea
                                        rows={3}
                                        value={itineraryEditForm.notes}
                                        onChange={(event) =>
                                          setItineraryEditForm((prev) => ({ ...prev, notes: event.target.value }))
                                        }
                                      />
                                    </label>
                                    <div className="row-buttons">
                                      <button type="submit" disabled={busy}>
                                        保存
                                      </button>
                                      <button type="button" className="secondary" onClick={cancelEditItinerary}>
                                        キャンセル
                                      </button>
                                    </div>
                                  </form>
                                ) : null}
                              </article>
                            ))}
                          </div>
                        </section>
                      ))
                    )}
                  </div>
                </section>
              ) : null}

              {activeTab === 'guide' ? (
                <section className="content-panel">
                  <h2>足袋naviのしおりをデコレーションする</h2>
                  <form className="form" onSubmit={handleAddGuide}>
                    <div className="quick-template-panel">
                      <label>
                        しおりテンプレート
                        <select
                          value={selectedGuideTemplate}
                          onChange={(event) => setSelectedGuideTemplate(event.target.value)}
                        >
                          {GUIDE_TEMPLATE_OPTIONS.map((template) => (
                            <option key={template.key} value={template.key}>
                              {template.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button type="button" className="secondary" onClick={() => applyGuideTemplateToForm()}>
                        テンプレートを反映
                      </button>
                    </div>
                    <div className="row-buttons">
                      <button type="button" className="secondary" onClick={applyOverviewTemplateToGuideForm}>
                        旅の概要テンプレートを使う
                      </button>
                    </div>
                    <label>
                      見出し
                      <input
                        required
                        value={guideForm.title}
                        onChange={(event) => setGuideForm((prev) => ({ ...prev, title: event.target.value }))}
                      />
                    </label>

                    <label>
                      本文
                      <textarea
                        rows={4}
                        value={guideForm.content}
                        onChange={(event) =>
                          setGuideForm((prev) => ({ ...prev, content: event.target.value }))
                        }
                      />
                    </label>

                    <div className="row two-col">
                      <label>
                        スタイル
                        <select
                          value={guideForm.variant}
                          onChange={(event) =>
                            setGuideForm((prev) => ({ ...prev, variant: event.target.value }))
                          }
                        >
                          <option value="plain">標準</option>
                          <option value="note">メモ風</option>
                          <option value="highlight">強調</option>
                        </select>
                      </label>

                      <label>
                        絵文字
                        <input
                          maxLength={2}
                          value={guideForm.emoji}
                          onChange={(event) =>
                            setGuideForm((prev) => ({ ...prev, emoji: event.target.value || '📍' }))
                          }
                        />
                      </label>
                    </div>

                    <div className="guide-details-editor">
                      <h4>概要項目（任意で追加・編集）</h4>
                      {(guideForm.details || []).length === 0 ? (
                        <p className="placeholder">項目はまだありません。</p>
                      ) : (
                        (guideForm.details || []).map((detail, index) => (
                          <div className="row guide-detail-row" key={detail.id || `${index}`}>
                            <label>
                              項目名
                              <input
                                value={detail.label || ''}
                                onChange={(event) =>
                                  updateGuideFormDetailAt(index, 'label', event.target.value)
                                }
                                placeholder="例: 日付"
                              />
                            </label>
                            <label>
                              内容
                              <input
                                value={detail.value || ''}
                                onChange={(event) =>
                                  updateGuideFormDetailAt(index, 'value', event.target.value)
                                }
                                placeholder="例: 2026-03-01"
                              />
                            </label>
                            <button
                              type="button"
                              className="danger"
                              onClick={() => removeGuideFormDetailAt(index)}
                            >
                              削除
                            </button>
                          </div>
                        ))
                      )}

                      <div className="row guide-detail-row">
                        <label>
                          追加する項目名
                          <input
                            value={guideCreateDetailDraft.label}
                            onChange={(event) =>
                              setGuideCreateDetailDraft((prev) => ({
                                ...prev,
                                label: event.target.value,
                              }))
                            }
                            placeholder="例: 出来事"
                          />
                        </label>
                        <label>
                          追加する内容
                          <input
                            value={guideCreateDetailDraft.value}
                            onChange={(event) =>
                              setGuideCreateDetailDraft((prev) => ({
                                ...prev,
                                value: event.target.value,
                              }))
                            }
                            placeholder="例: 到着・チェックイン"
                          />
                        </label>
                        <button type="button" className="secondary" onClick={addGuideDetailToForm}>
                          項目追加
                        </button>
                      </div>
                    </div>

                    <button type="submit" disabled={busy}>
                      セクション追加
                    </button>
                  </form>

                  <div className="list">
                    {workspace.guideSections.length === 0 ? (
                      <p className="placeholder">しおりセクションがありません。</p>
                    ) : (
                      workspace.guideSections.map((section) => (
                        <article
                          className={`card guide-card ${section.style?.variant || 'plain'}`}
                          key={section.id}
                        >
                          <div className="card-head">
                            <h3>
                              {section.style?.emoji || '📍'} {section.title}
                            </h3>
                            <div className="row-buttons">
                              {editingGuideId !== section.id ? (
                                <button type="button" onClick={() => startEditGuide(section)}>
                                  編集
                                </button>
                              ) : null}
                              <button
                                type="button"
                                className="danger"
                                onClick={() => handleDeleteGuide(section.id)}
                              >
                                削除
                              </button>
                            </div>
                          </div>

                          <p className="note">{section.content}</p>

                          {(normalizeGuideStyle(section.style).details || []).length > 0 ? (
                            <div className="guide-detail-grid">
                              {(normalizeGuideStyle(section.style).details || []).map((detail) => (
                                <div className="guide-detail-item" key={detail.id}>
                                  <strong>{detail.label || '項目'}</strong>
                                  <span>{detail.value || '未入力'}</span>
                                </div>
                              ))}
                            </div>
                          ) : null}

                          {editingGuideId === section.id ? (
                            <form className="form edit-form" onSubmit={(event) => saveEditGuide(event, section.id)}>
                              <label>
                                見出し
                                <input
                                  required
                                  value={guideEditForm.title}
                                  onChange={(event) =>
                                    setGuideEditForm((prev) => ({ ...prev, title: event.target.value }))
                                  }
                                />
                              </label>
                              <label>
                                本文
                                <textarea
                                  rows={4}
                                  value={guideEditForm.content}
                                  onChange={(event) =>
                                    setGuideEditForm((prev) => ({ ...prev, content: event.target.value }))
                                  }
                                />
                              </label>
                              <div className="row two-col">
                                <label>
                                  スタイル
                                  <select
                                    value={guideEditForm.variant}
                                    onChange={(event) =>
                                      setGuideEditForm((prev) => ({ ...prev, variant: event.target.value }))
                                    }
                                  >
                                    <option value="plain">標準</option>
                                    <option value="note">メモ風</option>
                                    <option value="highlight">強調</option>
                                  </select>
                                </label>
                                <label>
                                  絵文字
                                  <input
                                    maxLength={2}
                                    value={guideEditForm.emoji}
                                    onChange={(event) =>
                                      setGuideEditForm((prev) => ({
                                        ...prev,
                                        emoji: event.target.value || '📍',
                                      }))
                                    }
                                  />
                                </label>
                              </div>

                              <div className="guide-details-editor">
                                <h4>概要項目（任意で追加・編集）</h4>
                                {(guideEditForm.details || []).length === 0 ? (
                                  <p className="placeholder">項目はまだありません。</p>
                                ) : (
                                  (guideEditForm.details || []).map((detail, index) => (
                                    <div className="row guide-detail-row" key={detail.id || `${index}`}>
                                      <label>
                                        項目名
                                        <input
                                          value={detail.label || ''}
                                          onChange={(event) =>
                                            updateGuideDetailAt(index, 'label', event.target.value)
                                          }
                                          placeholder="例: 日付"
                                        />
                                      </label>
                                      <label>
                                        内容
                                        <input
                                          value={detail.value || ''}
                                          onChange={(event) =>
                                            updateGuideDetailAt(index, 'value', event.target.value)
                                          }
                                          placeholder="例: 2026-03-01"
                                        />
                                      </label>
                                      <button
                                        type="button"
                                        className="danger"
                                        onClick={() => removeGuideDetailAt(index)}
                                      >
                                        削除
                                      </button>
                                    </div>
                                  ))
                                )}

                                <div className="row guide-detail-row">
                                  <label>
                                    追加する項目名
                                    <input
                                      value={guideDetailDraft.label}
                                      onChange={(event) =>
                                        setGuideDetailDraft((prev) => ({
                                          ...prev,
                                          label: event.target.value,
                                        }))
                                      }
                                      placeholder="例: 出来事"
                                    />
                                  </label>
                                  <label>
                                    追加する内容
                                    <input
                                      value={guideDetailDraft.value}
                                      onChange={(event) =>
                                        setGuideDetailDraft((prev) => ({
                                          ...prev,
                                          value: event.target.value,
                                        }))
                                      }
                                      placeholder="例: 到着・チェックイン"
                                    />
                                  </label>
                                  <button type="button" className="secondary" onClick={addGuideDetailToEdit}>
                                    項目追加
                                  </button>
                                </div>
                              </div>

                              <div className="row-buttons">
                                <button type="submit" disabled={busy}>
                                  保存
                                </button>
                                <button type="button" className="secondary" onClick={cancelEditGuide}>
                                  キャンセル
                                </button>
                              </div>
                            </form>
                          ) : null}
                        </article>
                      ))
                    )}
                  </div>
                </section>
              ) : null}

              {activeTab === 'memories' ? (
                <section className="content-panel">
                  <h2>思い出を残す（画像ファイルアップロード）</h2>
                  <form className="form" onSubmit={handleMemorySearch}>
                    <label>
                      AI類似検索（思い出キーワード）
                      <input
                        value={memorySearchQuery}
                        onChange={(event) => setMemorySearchQuery(event.target.value)}
                        placeholder="例: 温泉、夕日、ロープウェイ"
                      />
                    </label>
                    <div className="row-buttons">
                      <button type="submit" className="secondary" disabled={memorySearchBusy}>
                        {memorySearchBusy ? '検索中...' : '類似検索する'}
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => {
                          setMemorySearchQuery('');
                          setMemorySearchResults([]);
                          setMemorySearchSource('');
                        }}
                        disabled={memorySearchBusy}
                      >
                        結果をクリア
                      </button>
                    </div>
                    {memorySearchResults.length > 0 ? (
                      <p className="status info mini">
                        {memorySearchSource === 'pinecone' ? 'AIベクトル検索' : 'キーワード検索'} / 件数: {memorySearchResults.length}
                      </p>
                    ) : null}
                  </form>

                  {memorySearchResults.length > 0 ? (
                    <div className="list">
                      {memorySearchResults.map((result) => (
                        <article className="card" key={`similar_${result.id}`}>
                          <div className="card-head">
                            <h3>🔎 {result.title || '無題'}</h3>
                            <span>score: {Number(result.score || 0).toFixed(3)}</span>
                          </div>
                          <p>{formatDateText(result.date)}</p>
                          <p className="note">{result.content || '本文なし'}</p>
                          {(result.image_urls || []).length ? (
                            <div className="memory-images">
                              {result.image_urls.map((url) => (
                                <a key={url} href={url} target="_blank" rel="noreferrer">
                                  <img src={url} alt="memory" />
                                </a>
                              ))}
                            </div>
                          ) : null}
                        </article>
                      ))}
                    </div>
                  ) : null}

                  <form className="form" onSubmit={handleAddMemory}>
                    <label>
                      日付
                      <input
                        type="date"
                        value={memoryForm.date}
                        onChange={(event) => setMemoryForm((prev) => ({ ...prev, date: event.target.value }))}
                      />
                    </label>

                    <label>
                      タイトル
                      <input
                        required
                        value={memoryForm.title}
                        onChange={(event) =>
                          setMemoryForm((prev) => ({ ...prev, title: event.target.value }))
                        }
                      />
                    </label>

                    <label>
                      本文
                      <textarea
                        required
                        rows={4}
                        value={memoryForm.content}
                        onChange={(event) =>
                          setMemoryForm((prev) => ({ ...prev, content: event.target.value }))
                        }
                      />
                    </label>

                    <label>
                      写真ファイル (最大3枚)
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={(event) =>
                          setMemoryFiles(Array.from(event.target.files || []).slice(0, 3))
                        }
                      />
                    </label>

                    {memoryFiles.length > 0 ? (
                      <p className="status info mini">
                        選択中: {memoryFiles.map((file) => file.name).join(', ')}
                      </p>
                    ) : null}

                    <button type="submit" disabled={busy}>
                      思い出を追加
                    </button>
                  </form>

                  <div className="list">
                    {workspace.memories.length === 0 ? (
                      <p className="placeholder">思い出の投稿がありません。</p>
                    ) : (
                      workspace.memories.map((memory) => (
                        <article className="card" key={memory.id}>
                          <div className="card-head">
                            <h3>{memory.title}</h3>
                            <div className="row-buttons">
                              <button
                                type="button"
                                className="secondary"
                                onClick={() => handleMemorySearchFromEntry(memory.id)}
                                disabled={memorySearchBusy}
                              >
                                この内容で類似検索
                              </button>
                              {editingMemoryId !== memory.id ? (
                                <button type="button" onClick={() => startEditMemory(memory)}>
                                  編集
                                </button>
                              ) : null}
                              <button
                                type="button"
                                className="danger"
                                onClick={() => handleDeleteMemory(memory)}
                              >
                                削除
                              </button>
                            </div>
                          </div>

                          <p>
                            {formatDateText(memory.date)} / 投稿者: {memberNameById[memory.author_user_id] || '不明'}
                          </p>
                          <p className="note">{memory.content}</p>

                          {(memory.image_urls || []).length ? (
                            <div className="memory-images">
                              {memory.image_urls.map((url) => (
                                <a key={url} href={url} target="_blank" rel="noreferrer">
                                  <img src={url} alt="memory" />
                                </a>
                              ))}
                            </div>
                          ) : null}

                          {editingMemoryId === memory.id ? (
                            <form className="form edit-form" onSubmit={(event) => saveEditMemory(event, memory.id)}>
                              <label>
                                日付
                                <input
                                  type="date"
                                  value={memoryEditForm.date}
                                  onChange={(event) =>
                                    setMemoryEditForm((prev) => ({ ...prev, date: event.target.value }))
                                  }
                                />
                              </label>
                              <label>
                                タイトル
                                <input
                                  required
                                  value={memoryEditForm.title}
                                  onChange={(event) =>
                                    setMemoryEditForm((prev) => ({ ...prev, title: event.target.value }))
                                  }
                                />
                              </label>
                              <label>
                                本文
                                <textarea
                                  required
                                  rows={4}
                                  value={memoryEditForm.content}
                                  onChange={(event) =>
                                    setMemoryEditForm((prev) => ({ ...prev, content: event.target.value }))
                                  }
                                />
                              </label>
                              <div className="row-buttons">
                                <button type="submit" disabled={busy}>
                                  保存
                                </button>
                                <button type="button" className="secondary" onClick={cancelEditMemory}>
                                  キャンセル
                                </button>
                              </div>
                            </form>
                          ) : null}
                        </article>
                      ))
                    )}
                  </div>
                </section>
              ) : null}

              {activeTab === 'design' ? (
                <section className="content-panel">
                  <h2>表紙・テーマをデコレーションする</h2>
                  <div className="preset-grid">
                    <button type="button" className="secondary" onClick={() => applyDesignPreset('classic')}>
                      Classic
                    </button>
                    <button type="button" className="secondary" onClick={() => applyDesignPreset('marine')}>
                      Marine
                    </button>
                    <button type="button" className="secondary" onClick={() => applyDesignPreset('journal')}>
                      Journal
                    </button>
                    <button type="button" className="secondary" onClick={() => applyDesignPreset('night')}>
                      Night
                    </button>
                  </div>

                  <div className={`design-preview ${backgroundClass(designForm.backgroundStyle)}`}>
                    {workspace.trip.cover_image_url ? (
                      <img src={workspace.trip.cover_image_url} alt="cover" className="design-preview-image" />
                    ) : null}
                    <div className="design-preview-overlay">
                      <span className="stamp">{designForm.stampText}</span>
                      <h3>{designForm.coverTitle || workspace.trip.name}</h3>
                      <p>{designForm.coverSubtitle || workspace.trip.destination}</p>
                    </div>
                  </div>

                  <form className="form" onSubmit={handleSaveDesign}>
                    <label>
                      表紙タイトル
                      <input
                        value={designForm.coverTitle}
                        onChange={(event) =>
                          setDesignForm((prev) => ({ ...prev, coverTitle: event.target.value }))
                        }
                      />
                    </label>

                    <label>
                      表紙サブタイトル
                      <input
                        value={designForm.coverSubtitle}
                        onChange={(event) =>
                          setDesignForm((prev) => ({ ...prev, coverSubtitle: event.target.value }))
                        }
                      />
                    </label>

                    <label>
                      スタンプ文字
                      <input
                        value={designForm.stampText}
                        onChange={(event) =>
                          setDesignForm((prev) => ({ ...prev, stampText: event.target.value }))
                        }
                      />
                    </label>

                    <div className="row two-col">
                      <label>
                        メインカラー
                        <input
                          type="color"
                          value={designForm.primaryColor}
                          onChange={(event) =>
                            setDesignForm((prev) => ({ ...prev, primaryColor: event.target.value }))
                          }
                        />
                      </label>

                      <label>
                        アクセントカラー
                        <input
                          type="color"
                          value={designForm.accentColor}
                          onChange={(event) =>
                            setDesignForm((prev) => ({ ...prev, accentColor: event.target.value }))
                          }
                        />
                      </label>
                    </div>

                    <div className="row two-col">
                      <label>
                        背景スタイル
                        <select
                          value={designForm.backgroundStyle}
                          onChange={(event) =>
                            setDesignForm((prev) => ({ ...prev, backgroundStyle: event.target.value }))
                          }
                        >
                          <option value="sunrise">Sunrise</option>
                          <option value="ocean">Ocean</option>
                          <option value="forest">Forest</option>
                          <option value="night">Night</option>
                        </select>
                      </label>

                      <label>
                        フォント
                        <select
                          value={designForm.fontStyle}
                          onChange={(event) =>
                            setDesignForm((prev) => ({ ...prev, fontStyle: event.target.value }))
                          }
                        >
                          <option value="mplus">M Plus</option>
                          <option value="serif">Serif</option>
                          <option value="hand">Handwritten</option>
                        </select>
                      </label>
                    </div>

                    <div className="row two-col">
                      <label>
                        レイアウトテンプレート
                        <select
                          value={designForm.layoutTemplate}
                          onChange={(event) =>
                            setDesignForm((prev) => ({ ...prev, layoutTemplate: event.target.value }))
                          }
                        >
                          {LAYOUT_TEMPLATE_OPTIONS.map((entry) => (
                            <option key={entry.key} value={entry.key}>
                              {entry.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label>
                        PDF出力レイアウト
                        <select
                          value={designForm.pdfTemplate}
                          onChange={(event) =>
                            setDesignForm((prev) => ({ ...prev, pdfTemplate: event.target.value }))
                          }
                        >
                          {PDF_TEMPLATE_OPTIONS.map((entry) => (
                            <option key={entry.key} value={entry.key}>
                              {entry.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <button type="submit" disabled={busy}>
                      デザインを保存
                    </button>
                  </form>

                  <div className="form">
                    <label>
                      表紙画像をアップロード
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(event) => setCoverFile(event.target.files?.[0] || null)}
                      />
                    </label>
                    {coverFile ? <p className="status info mini">選択中: {coverFile.name}</p> : null}
                    <button type="button" onClick={handleUploadCover} disabled={busy || !coverFile}>
                      表紙画像を保存
                    </button>
                  </div>
                </section>
              ) : null}
            </>
          )}
        </section>
      </section>

      {error ? <p className="status error">{error}</p> : null}
      {info ? <p className="status info">{info}</p> : null}
    </main>
  );
}

export default App;
