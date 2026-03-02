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
  reorderGuideSections,
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
import { AppShell, Button, Card, Container, Grid, Input, Stack } from './components/ui/primitives';
import { buildTemplateModel, getTemplateById, TEMPLATE_REGISTRY } from './templates/templateRegistry';
import './components/ui/primitives.css';
import './App.css';

const SELECTED_TRIP_KEY_PREFIX = 'travel_selected_trip_v2';
const EDITOR_DRAFT_KEY_PREFIX = 'tabinavi_editor_draft_v1';
const EDITOR_PREF_KEY_PREFIX = 'tabinavi_editor_pref_v1';

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
  retro: {
    stampText: 'RETRO TRIP',
    primaryColor: '#805a3b',
    accentColor: '#d08a4d',
    backgroundStyle: 'sunrise',
    fontStyle: 'serif',
    layoutTemplate: 'atelier',
    pdfTemplate: 'paper',
    uiTemplateId: 'templateA',
  },
  modern: {
    stampText: 'CITY NAVI',
    primaryColor: '#135f84',
    accentColor: '#35a9d9',
    backgroundStyle: 'ocean',
    fontStyle: 'mplus',
    layoutTemplate: 'timeline',
    pdfTemplate: 'timeline',
    uiTemplateId: 'templateB',
  },
  minimal: {
    stampText: 'MINIMAL NOTE',
    primaryColor: '#4b4d52',
    accentColor: '#9aa0a6',
    backgroundStyle: 'forest',
    fontStyle: 'mplus',
    layoutTemplate: 'notebook',
    pdfTemplate: 'table',
    uiTemplateId: 'templateA',
  },
};

const DESIGN_PRESET_OPTIONS = [
  { key: 'retro', label: 'レトロ', sub: 'あたたかい紙面トーン' },
  { key: 'modern', label: 'モダン', sub: '鮮やかで見やすい配色' },
  { key: 'minimal', label: 'ミニマル', sub: '落ち着いた余白重視' },
];

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
  uiTemplateId: DEFAULT_THEME.uiTemplateId,
};

const defaultCollapsedPanels = {
  itineraryComposer: false,
  itineraryList: false,
  guideComposer: false,
  guideList: false,
  guidePreview: false,
  memoryComposer: false,
  memoryList: false,
};

function safeJsonParse(value, fallback) {
  if (!value) {
    return fallback;
  }
  try {
    const parsed = JSON.parse(value);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function composeDraftStorageKey(scopeKey, formKey) {
  return `${EDITOR_DRAFT_KEY_PREFIX}:${scopeKey}:${formKey}`;
}

function composePrefStorageKey(scopeKey) {
  return `${EDITOR_PREF_KEY_PREFIX}:${scopeKey}`;
}

function composeEditDraftStorageKey(scopeKey, formKey, entityId) {
  return `${EDITOR_DRAFT_KEY_PREFIX}:${scopeKey}:${formKey}:edit:${entityId}`;
}

function requiredFieldClass(value) {
  return String(value || '').trim() ? '' : 'field-missing';
}

function truncateText(value, maxLength = 90) {
  const text = String(value || '').trim();
  if (!text) {
    return '';
  }
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}…`;
}

function humanizeErrorMessage(rawMessage) {
  const message = String(rawMessage || '').trim();
  if (!message) {
    return 'うまく処理できませんでした。時間をおいてもう一度お試しください。';
  }

  if (/failed to fetch|network|fetch failed/i.test(message)) {
    return '通信が不安定です。少し待ってからもう一度お試しください。';
  }
  if (message.includes('旅行作成後の確認に失敗')) {
    return '旅行の作成に少し時間がかかっています。数秒後に一覧を開き直してください。';
  }
  if (message.includes('アクセス権')) {
    return 'この旅行にはまだ参加していないようです。招待コードを確認してください。';
  }
  if (message.includes('認証が必要')) {
    return 'ログイン状態を確認できませんでした。もう一度ログインしてください。';
  }
  if (/timeout|timed out/i.test(message)) {
    return '処理が混み合っています。少し待ってから再実行してください。';
  }

  return message;
}

function debugThemeForTemplate(templateId = 'templateA') {
  const isBoard = String(templateId) === 'templateB';
  return {
    ...DEFAULT_THEME,
    uiTemplateId: isBoard ? 'templateB' : 'templateA',
    layoutTemplate: isBoard ? 'timeline' : 'atelier',
    pdfTemplate: isBoard ? 'paper' : 'timeline',
    stampText: isBoard ? 'Navigator Board' : 'Atelier Classic',
  };
}

function debugDataImage(seedText, hue = 200) {
  const safeLabel = String(seedText || 'tabinavi').replace(/[<>&"]/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="hsl(${hue},70%,82%)"/>
        <stop offset="100%" stop-color="hsl(${(hue + 40) % 360},72%,64%)"/>
      </linearGradient>
    </defs>
    <rect width="1200" height="800" fill="url(#g)"/>
    <text x="60" y="120" font-size="56" font-family="Arial, sans-serif" fill="#1f2937">${safeLabel}</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function buildPdfDebugWorkspace(templateId = 'templateA', seed = 0) {
  const baseDate = new Date(2026, 2, 1 + seed);
  const dateText = baseDate.toISOString().slice(0, 10);
  const nextDate = new Date(baseDate.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const theme = debugThemeForTemplate(templateId);
  const members = [
    { user_id: 'debug_u1', name: 'sample', role: 'owner', joined_at: `${dateText}T07:00:00.000Z` },
    { user_id: 'debug_u2', name: 'friend', role: 'member', joined_at: `${dateText}T07:10:00.000Z` },
  ];

  const itineraryItems = Array.from({ length: 14 }, (_, index) => {
    const isSecondDay = index >= 7;
    const dayDate = isSecondDay ? nextDate : dateText;
    const startHour = 7 + (index % 7) * 2;
    const endHour = startHour + 1;
    return {
      id: `debug_item_${seed}_${index}`,
      tripId: `debug_trip_${seed}`,
      date: dayDate,
      start_time: `${String(startHour).padStart(2, '0')}:00`,
      end_time: `${String(endHour).padStart(2, '0')}:30`,
      title: `予定 ${index + 1} / 長文テスト ${'移動と観光を両立する'.repeat(index % 3 === 0 ? 2 : 1)}`,
      place: index % 2 === 0 ? '東京駅' : '浅草・上野周辺',
      link_url: index % 3 === 0 ? 'https://maps.google.com/?q=Tokyo+Station' : '',
      icon: index % 4 === 0 ? '🏨' : index % 3 === 0 ? '🍽️' : '📍',
      notes:
        index % 2 === 0
          ? '集合時間に遅れないよう、10分前に到着。\nチケットと連絡先を再確認。'
          : '移動中に写真撮影ポイントを共有。'.repeat(2),
      owner_user_id: index % 2 === 0 ? 'debug_u1' : 'debug_u2',
      created_at: `${dayDate}T00:00:00.000Z`,
      updated_at: `${dayDate}T00:00:00.000Z`,
      order_index: index + 1,
    };
  });

  const guideSections = [
    {
      id: `debug_guide_${seed}_0`,
      tripId: `debug_trip_${seed}`,
      title: '旅の概要',
      content: '集合場所と連絡ルール、当日の注意点をまとめるセクションです。',
      order_index: 1,
      style: {
        variant: 'highlight',
        emoji: '🗺️',
        details: [
          { id: 'd1', label: '日付', value: `${dateText} 〜 ${nextDate}` },
          { id: 'd2', label: '集合', value: '東京駅 丸の内口 07:15' },
        ],
      },
      created_at: `${dateText}T00:00:00.000Z`,
      updated_at: `${dateText}T00:00:00.000Z`,
    },
    {
      id: `debug_guide_${seed}_1`,
      tripId: `debug_trip_${seed}`,
      title: '持ち物',
      content: '- 身分証\n- 充電器\n- 雨具\n- 常備薬',
      order_index: 2,
      style: {
        variant: 'plain',
        emoji: '🎒',
        details: [],
      },
      created_at: `${dateText}T00:00:00.000Z`,
      updated_at: `${dateText}T00:00:00.000Z`,
    },
  ];

  const memories = Array.from({ length: 8 }, (_, index) => ({
    id: `debug_memory_${seed}_${index}`,
    tripId: `debug_trip_${seed}`,
    date: index < 4 ? dateText : nextDate,
    title: `思い出 ${index + 1}`,
    content:
      '写真中心で振り返るための本文テキスト。移動・食事・景色・会話の記録を残します。'.repeat(
        index % 2 === 0 ? 2 : 1,
      ),
    image_urls: [
      debugDataImage(`Memory-${seed}-${index}-A`, 190 + (index % 5) * 12),
      debugDataImage(`Memory-${seed}-${index}-B`, 130 + (index % 6) * 10),
      debugDataImage(`Memory-${seed}-${index}-C`, 20 + (index % 7) * 14),
    ],
    image_captions: ['朝の景色', '移動中の一枚', '夜景メモ'],
    author_user_id: index % 2 === 0 ? 'debug_u1' : 'debug_u2',
    created_at: `${dateText}T00:00:00.000Z`,
    updated_at: `${dateText}T00:00:00.000Z`,
  }));

  return {
    trip: {
      id: `debug_trip_${seed}`,
      code: 'DBG123',
      name: `PDF安定テスト ${seed + 1}`,
      destination: '東京',
      edit_passphrase_hash: '',
      start_date: dateText,
      end_date: nextDate,
      created_by: 'debug_u1',
      created_at: `${dateText}T00:00:00.000Z`,
      cover_title: `PDF安定テスト ${seed + 1}`,
      cover_subtitle: '長文・画像多め・2日構成',
      cover_image_path: '',
      cover_image_url:
        debugDataImage(`Cover-${seed}`, 210),
      theme,
    },
    members,
    itineraryItems,
    guideSections,
    memories,
  };
}

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
    label: '持ち物',
    apply: () => ({
      title: '持ち物',
      content: '- パスポート / 身分証\n- 充電器\n- 保険証\n- 常備薬',
      variant: 'plain',
      emoji: '🎒',
      details: [],
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

const LAYOUT_QUICK_OPTIONS = [
  {
    key: 'balanced',
    label: '読みやすい標準',
    description: 'テンプレA + タイムラインPDF',
    apply: {
      uiTemplateId: 'templateA',
      layoutTemplate: 'atelier',
      pdfTemplate: 'timeline',
    },
  },
  {
    key: 'planner',
    label: '計画重視',
    description: 'テンプレB + 表形式PDF',
    apply: {
      uiTemplateId: 'templateB',
      layoutTemplate: 'timeline',
      pdfTemplate: 'table',
    },
  },
  {
    key: 'album',
    label: '思い出重視',
    description: 'テンプレB + 紙面PDF',
    apply: {
      uiTemplateId: 'templateB',
      layoutTemplate: 'notebook',
      pdfTemplate: 'paper',
    },
  },
];

const DEMO_ITINERARY_FIXTURES = [
  {
    date: '2026-03-10',
    startTime: '07:30',
    endTime: '08:30',
    title: '朝カフェで集合',
    place: '東京駅 丸の内口',
    icon: '☕',
    linkUrl: 'https://maps.google.com/?q=Tokyo+Station',
    notes: '点呼・切符確認・当日の連絡ルールを共有',
  },
  {
    date: '2026-03-10',
    startTime: '10:00',
    endTime: '12:00',
    title: '浅草エリア散策',
    place: '雷門〜仲見世',
    icon: '🗺️',
    linkUrl: '',
    notes: '自由行動あり。集合は11:50に雷門前。',
  },
  {
    date: '2026-03-10',
    startTime: '12:30',
    endTime: '13:40',
    title: 'ランチ予約',
    place: '蔵前エリア',
    icon: '🍽️',
    linkUrl: '',
    notes: '予約番号を幹事が管理',
  },
  {
    date: '2026-03-10',
    startTime: '15:00',
    endTime: '16:20',
    title: 'チェックイン',
    place: 'ホテル',
    icon: '🏨',
    linkUrl: '',
    notes: '荷物整理・休憩',
  },
  {
    date: '2026-03-11',
    startTime: '09:00',
    endTime: '11:40',
    title: '美術館',
    place: '上野',
    icon: '🎫',
    linkUrl: '',
    notes: '電子チケットを事前に表示',
  },
  {
    date: '2026-03-11',
    startTime: '18:00',
    endTime: '20:00',
    title: '夜景スポット',
    place: '東京湾エリア',
    icon: '📸',
    linkUrl: '',
    notes: '撮影タイム。防寒対策。',
  },
];

const DEMO_GUIDE_FIXTURES = [
  {
    title: '当日の連絡ルール',
    content: '遅れるときはグループチャットへ。集合10分前に現在地を共有。',
    style: {
      variant: 'note',
      emoji: '📱',
      details: [
        { label: '幹事', value: 'sample' },
        { label: '緊急連絡', value: 'ホテル代表番号 / 家族連絡先' },
      ],
    },
  },
  {
    title: '予算メモ',
    content: '交通・宿・食事をざっくり記録して、帰宅後に精算。',
    style: {
      variant: 'plain',
      emoji: '💰',
      details: [
        { label: '交通', value: '8,000円' },
        { label: '宿泊', value: '12,000円' },
        { label: '食事', value: '6,000円' },
      ],
    },
  },
];

const DEMO_MEMORY_FIXTURES = [
  {
    date: '2026-03-10',
    title: '初日の朝',
    content: '駅前で集合して、旅が始まる感じが一気に高まりました。',
    captions: ['集合写真', '移動中の景色'],
  },
  {
    date: '2026-03-11',
    title: '夜景スポット',
    content: '風が強かったけど、写真が想像以上にきれいに撮れました。',
    captions: ['ベストショット', '帰り道の一枚'],
  },
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

function resolveTripImageUrl(rawUrl, rawPath = '') {
  const first = String(rawUrl || '').trim();
  if (first.startsWith('data:') || /^https?:\/\//i.test(first)) {
    return first;
  }

  const second = String(rawPath || '').trim();
  const candidate = first || second;
  if (!candidate) {
    return '';
  }

  if (candidate.startsWith('data:') || /^https?:\/\//i.test(candidate)) {
    return candidate;
  }

  if (typeof window === 'undefined' || !window.location?.origin) {
    return candidate;
  }

  if (candidate.startsWith('/')) {
    return `${window.location.origin}${candidate}`;
  }
  return `${window.location.origin}/${candidate}`;
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

function createDemoImageFile(label = 'demo', hue = 210) {
  if (typeof File === 'undefined' || typeof Blob === 'undefined') {
    return null;
  }
  const safeLabel = String(label || 'demo').replace(/[<>&"]/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="hsl(${hue},70%,80%)"/>
        <stop offset="100%" stop-color="hsl(${(hue + 36) % 360},72%,64%)"/>
      </linearGradient>
    </defs>
    <rect width="1200" height="800" fill="url(#g)"/>
    <text x="64" y="122" font-size="56" font-family="Arial, sans-serif" fill="#1f2937">${safeLabel}</text>
  </svg>`;
  return new File([new Blob([svg], { type: 'image/svg+xml' })], `${safeLabel}.svg`, {
    type: 'image/svg+xml',
  });
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

function groupMemoryCardsByDay(cards) {
  const byDate = new Map();
  for (const card of cards || []) {
    const key = String(card?.date || 'undated');
    const current = byDate.get(key) || [];
    current.push(card);
    byDate.set(key, current);
  }

  const datedKeys = [...byDate.keys()]
    .filter((key) => key !== 'undated')
    .sort((a, b) => a.localeCompare(b));

  const sections = datedKeys.map((date, index) => ({
    key: date,
    label: `DAY${index + 1}`,
    title: date,
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

function normalizeTripSummary(trip) {
  return {
    ...(trip || {}),
    theme: normalizeTheme(trip?.theme),
  };
}

function upsertTripCollection(currentTrips, incomingTrip) {
  const normalizedIncoming = normalizeTripSummary(incomingTrip);
  const current = Array.isArray(currentTrips) ? currentTrips : [];
  const existingIndex = current.findIndex((entry) => entry.id === normalizedIncoming.id);

  if (existingIndex >= 0) {
    const merged = current.map((entry, index) =>
      index === existingIndex ? { ...entry, ...normalizedIncoming } : entry,
    );
    return merged;
  }

  return [normalizedIncoming, ...current];
}

function mergeTripCollections(baseTrips, incomingTrips = []) {
  let merged = Array.isArray(baseTrips) ? [...baseTrips] : [];
  for (const entry of Array.isArray(incomingTrips) ? incomingTrips : []) {
    merged = upsertTripCollection(merged, entry);
  }
  return merged;
}

function buildOptimisticWorkspace(trip, user, displayName = '', role = 'owner') {
  return {
    trip: normalizeTripSummary(trip),
    members: [
      {
        user_id: user?.id || '',
        name:
          String(displayName || '').trim() ||
          String(user?.user_metadata?.display_name || '').trim() ||
          String(user?.email || '').split('@')[0] ||
          'Traveler',
        role,
        joined_at: new Date().toISOString(),
      },
    ],
    itineraryItems: [],
    guideSections: [],
    memories: [],
  };
}

function normalizeTimeValue(value = '') {
  const text = String(value || '').trim();
  if (!/^\d{2}:\d{2}$/.test(text)) {
    return '';
  }
  return text;
}

function addMinutesToTime(baseTime = '', minutes = 30) {
  const normalized = normalizeTimeValue(baseTime);
  if (!normalized) {
    return '';
  }
  const [hour, minute] = normalized.split(':').map((entry) => Number(entry));
  const seed = new Date(2020, 0, 1, hour, minute, 0, 0);
  seed.setMinutes(seed.getMinutes() + minutes);
  return `${String(seed.getHours()).padStart(2, '0')}:${String(seed.getMinutes()).padStart(2, '0')}`;
}

function sortItineraryByOrder(items = []) {
  return [...(items || [])].sort((a, b) => {
    const aOrder = Number.isFinite(a.order_index) ? a.order_index : Number.MAX_SAFE_INTEGER;
    const bOrder = Number.isFinite(b.order_index) ? b.order_index : Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) {
      return aOrder - bOrder;
    }
    const aStamp = `${a.date || ''}${a.start_time || ''}${a.created_at || ''}${a.id || ''}`;
    const bStamp = `${b.date || ''}${b.start_time || ''}${b.created_at || ''}${b.id || ''}`;
    return aStamp.localeCompare(bStamp);
  });
}

function applyOrderIndex(items = []) {
  return (items || []).map((entry, index) => ({
    ...entry,
    order_index: index + 1,
  }));
}

function normalizeItineraryForWorkspace(item = {}, fallbackUserId = '') {
  return {
    ...item,
    icon: String(item?.icon || '📍'),
    link_url: String(item?.link_url || ''),
    owner_user_id: String(item?.owner_user_id || fallbackUserId || ''),
    order_index: Number.isFinite(item?.order_index) ? item.order_index : Number.MAX_SAFE_INTEGER,
  };
}

function sortGuideByOrder(items = []) {
  return [...(items || [])].sort((a, b) => {
    const aOrder = Number.isFinite(a.order_index) ? a.order_index : Number.MAX_SAFE_INTEGER;
    const bOrder = Number.isFinite(b.order_index) ? b.order_index : Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) {
      return aOrder - bOrder;
    }
    return `${a.created_at || ''}${a.id || ''}`.localeCompare(`${b.created_at || ''}${b.id || ''}`);
  });
}

function applyGuideOrderIndex(items = []) {
  return (items || []).map((entry, index) => ({
    ...entry,
    order_index: index + 1,
  }));
}

function normalizeGuideSectionForWorkspace(section = {}) {
  return {
    ...section,
    style: normalizeGuideStyle(section.style),
    order_index: Number.isFinite(section?.order_index) ? section.order_index : Number.MAX_SAFE_INTEGER,
  };
}

function buildOneTapItineraryInput(workspace, itineraryForm, templateOption) {
  const currentItems = sortItineraryByOrder(workspace?.itineraryItems || []);
  const latest = currentItems[currentItems.length - 1] || null;
  const fallbackDate = itineraryForm.date || latest?.date || workspace?.trip?.start_date || '';
  const fallbackStart = itineraryForm.startTime || itineraryForm.endTime || latest?.end_time || latest?.start_time || '09:00';
  const fallbackEnd = itineraryForm.endTime || addMinutesToTime(fallbackStart, 60) || '';
  return {
    date: fallbackDate,
    startTime: fallbackStart,
    endTime: fallbackEnd,
    title: templateOption?.title || '予定',
    place: itineraryForm.place || latest?.place || workspace?.trip?.destination || '',
    linkUrl: itineraryForm.linkUrl || '',
    icon: templateOption?.icon || itineraryForm.icon || '📍',
    notes: templateOption?.notes || '',
  };
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
  const [lastDeletedItinerary, setLastDeletedItinerary] = useState(null);
  const [memorySearchQuery, setMemorySearchQuery] = useState('');
  const [memorySearchResults, setMemorySearchResults] = useState([]);
  const [memorySearchSource, setMemorySearchSource] = useState('');
  const [memorySearchBusy, setMemorySearchBusy] = useState(false);
  const [designForm, setDesignForm] = useState(defaultDesignForm);
  const [draggingItemId, setDraggingItemId] = useState('');
  const [memoryFiles, setMemoryFiles] = useState([]);
  const [memoryEditCaptions, setMemoryEditCaptions] = useState([]);
  const [coverFile, setCoverFile] = useState(null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState('');
  const [collapsedPanels, setCollapsedPanels] = useState(defaultCollapsedPanels);
  const [previewMode, setPreviewMode] = useState('split');
  const [draftSavedAt, setDraftSavedAt] = useState('');
  const [activeShioriSectionKey, setActiveShioriSectionKey] = useState('itinerary');
  const [activeMemoryDayKey, setActiveMemoryDayKey] = useState('');

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const daySectionRefs = useRef({});
  const shioriSectionRefs = useRef({});
  const memoryDaySectionRefs = useRef({});
  const memoryFilesRef = useRef([]);
  const workspaceRef = useRef(null);
  const restoredDraftScopeRef = useRef('');
  const tripMutationVersionRef = useRef(0);

  const markTripMutation = () => {
    tripMutationVersionRef.current += 1;
    return tripMutationVersionRef.current;
  };

  const memberNameById = useMemo(() => {
    if (!workspace) {
      return {};
    }

    return Object.fromEntries(workspace.members.map((member) => [member.user_id, member.name]));
  }, [workspace]);
  const isGuestUser = Boolean(session?.user?.user_metadata?.is_guest);

  const currentTheme = useMemo(() => pickTheme(workspace?.trip), [workspace]);
  const resolvedCoverImageUrl = useMemo(
    () => resolveTripImageUrl(workspace?.trip?.cover_image_url, workspace?.trip?.cover_image_path),
    [workspace?.trip?.cover_image_url, workspace?.trip?.cover_image_path],
  );
  const effectiveCoverImageUrl = coverPreviewUrl || resolvedCoverImageUrl;
  const draftScopeKey = useMemo(() => {
    const userId = session?.user?.id;
    if (!userId) {
      return '';
    }
    return `${userId}:${selectedTripId || 'global'}`;
  }, [session?.user?.id, selectedTripId]);
  const templateModel = useMemo(
    () => buildTemplateModel(workspace, memberNameById),
    [workspace, memberNameById],
  );
  const activeTemplate = useMemo(
    () => getTemplateById(currentTheme.uiTemplateId || DEFAULT_THEME.uiTemplateId),
    [currentTheme.uiTemplateId],
  );
  const ActiveTemplateFrame = activeTemplate.Component;
  const selectedDesignTemplate = useMemo(
    () => getTemplateById(designForm.uiTemplateId || currentTheme.uiTemplateId || DEFAULT_THEME.uiTemplateId),
    [designForm.uiTemplateId, currentTheme.uiTemplateId],
  );
  const DesignTemplatePreview = selectedDesignTemplate.PreviewComponent;
  const itineraryStatus = useMemo(
    () => computeNowNextIds(workspace?.itineraryItems || [], nowMs),
    [workspace?.itineraryItems, nowMs],
  );
  const itineraryDaySections = useMemo(
    () => groupItemsByDay(workspace?.itineraryItems || []),
    [workspace?.itineraryItems],
  );
  const itineraryMetrics = useMemo(() => {
    const items = workspace?.itineraryItems || [];
    const completedDateCount = new Set(items.map((entry) => String(entry.date || '')).filter(Boolean)).size;
    const withPlaceCount = items.filter((entry) => String(entry.place || '').trim()).length;
    return {
      total: items.length,
      days: completedDateCount,
      withPlace: withPlaceCount,
    };
  }, [workspace?.itineraryItems]);
  const selectedItineraryTemplateOption = useMemo(
    () =>
      ITINERARY_QUICK_TEMPLATE_OPTIONS.find((entry) => entry.key === selectedItineraryTemplate) ||
      ITINERARY_QUICK_TEMPLATE_OPTIONS[0],
    [selectedItineraryTemplate],
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
  const itineraryPreviewSections = useMemo(() => {
    const currentItems = (workspace?.itineraryItems || []).map((entry) => ({ ...entry }));
    const editingDraftTitle = String(itineraryEditForm.title || '').trim();
    const hasCreateDraft = [
      itineraryForm.title,
      itineraryForm.place,
      itineraryForm.notes,
      itineraryForm.date,
      itineraryForm.startTime,
    ].some((entry) => String(entry || '').trim());

    const withEditing = editingItineraryId
      ? currentItems.map((entry) =>
          entry.id === editingItineraryId
            ? {
                ...entry,
                date: itineraryEditForm.date,
                start_time: itineraryEditForm.startTime,
                end_time: itineraryEditForm.endTime,
                title: editingDraftTitle || '(タイトル未入力)',
                place: itineraryEditForm.place,
                link_url: itineraryEditForm.linkUrl,
                icon: itineraryEditForm.icon || '📍',
                notes: itineraryEditForm.notes,
                __isPreviewDraft: true,
              }
            : entry,
        )
      : currentItems;

    const withCreateDraft = hasCreateDraft
      ? [
          ...withEditing,
          {
            id: '__draft_new_item__',
            date: itineraryForm.date,
            start_time: itineraryForm.startTime,
            end_time: itineraryForm.endTime,
            title: String(itineraryForm.title || '').trim() || '(新しい予定の下書き)',
            place: itineraryForm.place,
            link_url: itineraryForm.linkUrl,
            icon: itineraryForm.icon || '📍',
            notes: itineraryForm.notes,
            __isPreviewDraft: true,
          },
        ]
      : withEditing;

    return groupItemsByDay(withCreateDraft);
  }, [
    workspace?.itineraryItems,
    editingItineraryId,
    itineraryEditForm.date,
    itineraryEditForm.endTime,
    itineraryEditForm.icon,
    itineraryEditForm.linkUrl,
    itineraryEditForm.notes,
    itineraryEditForm.place,
    itineraryEditForm.startTime,
    itineraryEditForm.title,
    itineraryForm.date,
    itineraryForm.endTime,
    itineraryForm.icon,
    itineraryForm.linkUrl,
    itineraryForm.notes,
    itineraryForm.place,
    itineraryForm.startTime,
    itineraryForm.title,
  ]);
  const shioriPreviewSections = useMemo(() => {
    const itineraryItems = templateModel.itinerary || [];
    const reservationItems = templateModel.reservations || [];
    const packingItems = templateModel.packingList || [];
    const memberItems = templateModel.members || [];
    const noteItems = templateModel.notes || [];
    const memoryItems = templateModel.memories || [];

    return [
      {
        key: 'itinerary',
        title: '旅程',
        subtitle: `${itineraryItems.length}件`,
        rows: itineraryItems.map((entry) => ({
          id: entry.id,
          title: `${entry.icon || '📍'} ${entry.title || '無題'}`,
          meta: [entry.date, entry.startTime && `${entry.startTime}〜${entry.endTime || '--:--'}`, entry.place]
            .filter(Boolean)
            .join(' / '),
          note: truncateText(entry.notes, 110),
        })),
      },
      {
        key: 'reservations',
        title: '予約',
        subtitle: `${reservationItems.length}件`,
        rows: reservationItems.map((entry) => ({
          id: entry.id,
          title: entry.title || '予約',
          meta: [entry.date, entry.startTime, entry.place].filter(Boolean).join(' / '),
          note: truncateText(entry.note, 100),
        })),
      },
      {
        key: 'packing',
        title: '持ち物',
        subtitle: `${packingItems.length}件`,
        rows: packingItems.map((entry) => ({
          id: entry.id,
          title: entry.label || '持ち物',
          meta: '',
          note: '',
        })),
      },
      {
        key: 'members',
        title: 'メンバー',
        subtitle: `${memberItems.length}名`,
        rows: memberItems.map((entry) => ({
          id: entry.userId,
          title: entry.name || 'Traveler',
          meta: entry.role || 'member',
          note: '',
        })),
      },
      {
        key: 'notes',
        title: 'メモ',
        subtitle: `${noteItems.length}件`,
        rows: noteItems.map((entry) => ({
          id: entry.id,
          title: `${entry.emoji || '📝'} ${entry.title || 'メモ'}`,
          meta: entry.variant || 'plain',
          note: truncateText(entry.content, 100),
        })),
      },
      {
        key: 'memories',
        title: '思い出',
        subtitle: `${memoryItems.length}件`,
        rows: memoryItems.map((entry) => ({
          id: entry.id,
          title: entry.title || '思い出',
          meta: entry.date || '日付未設定',
          note: truncateText(entry.content, 100),
        })),
      },
    ];
  }, [templateModel]);
  const memoryStoryCards = useMemo(() => {
    const memories = workspace?.memories || [];
    const itinerary = workspace?.itineraryItems || [];
    const sortedMemories = [...memories].sort((a, b) => {
      const aDate = String(a?.date || '9999-99-99');
      const bDate = String(b?.date || '9999-99-99');
      if (aDate !== bDate) {
        return aDate.localeCompare(bDate);
      }
      const aCreated = String(a?.created_at || '');
      const bCreated = String(b?.created_at || '');
      return aCreated.localeCompare(bCreated);
    });
    return sortedMemories.map((memory) => {
      const sameDay = itinerary.find((entry) => String(entry.date || '') === String(memory.date || ''));
      const placeHint = sameDay?.place || '';
      const imageUrls = Array.isArray(memory.image_urls) ? memory.image_urls : [];
      const imageCaptions = Array.isArray(memory.image_captions) ? memory.image_captions : [];
      return {
        id: memory.id,
        title: memory.title || '思い出',
        date: memory.date || '',
        place: placeHint,
        content: memory.content || '',
        authorName: memberNameById[memory.author_user_id] || '不明',
        leadImageUrl: imageUrls[0] || '',
        leadCaption: imageCaptions[0] || '',
        gallery: imageUrls.map((url, index) => ({
          url,
          caption: imageCaptions[index] || '',
        })),
      };
    });
  }, [workspace?.itineraryItems, workspace?.memories, memberNameById]);
  const memoryStoryDaySections = useMemo(() => groupMemoryCardsByDay(memoryStoryCards), [memoryStoryCards]);

  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError && mounted) {
        setError(humanizeErrorMessage(sessionError.message || 'セッションの確認に失敗しました。'));
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

  useEffect(() => {
    setLastDeletedItinerary(null);
  }, [selectedTripId]);

  useEffect(() => {
    if (!lastDeletedItinerary) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      setLastDeletedItinerary(null);
    }, 12000);
    return () => {
      window.clearTimeout(timer);
    };
  }, [lastDeletedItinerary]);

  useEffect(() => {
    if (shioriPreviewSections.length === 0) {
      return;
    }
    if (!shioriPreviewSections.some((section) => section.key === activeShioriSectionKey)) {
      setActiveShioriSectionKey(shioriPreviewSections[0].key);
    }
  }, [activeShioriSectionKey, shioriPreviewSections]);

  useEffect(() => {
    if (memoryStoryDaySections.length === 0) {
      if (activeMemoryDayKey) {
        setActiveMemoryDayKey('');
      }
      return;
    }
    if (!memoryStoryDaySections.some((section) => section.key === activeMemoryDayKey)) {
      setActiveMemoryDayKey(memoryStoryDaySections[0].key);
    }
  }, [activeMemoryDayKey, memoryStoryDaySections]);

  useEffect(() => {
    if (activeTab !== 'guide' || collapsedPanels.guidePreview) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (!visible.length) {
          return;
        }
        const nextKey = visible[0].target.getAttribute('data-section-key') || '';
        if (nextKey) {
          setActiveShioriSectionKey(nextKey);
        }
      },
      {
        root: null,
        rootMargin: '-22% 0px -55% 0px',
        threshold: [0.25, 0.4, 0.55, 0.7],
      },
    );

    for (const section of shioriPreviewSections) {
      const node = shioriSectionRefs.current[section.key];
      if (node) {
        observer.observe(node);
      }
    }

    return () => {
      observer.disconnect();
    };
  }, [activeTab, collapsedPanels.guidePreview, shioriPreviewSections]);

  useEffect(() => {
    if (!coverFile) {
      setCoverPreviewUrl('');
      return undefined;
    }

    const localUrl = URL.createObjectURL(coverFile);
    setCoverPreviewUrl(localUrl);
    return () => {
      URL.revokeObjectURL(localUrl);
    };
  }, [coverFile]);

  useEffect(() => {
    if (activeTab !== 'memories') {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (!visible.length) {
          return;
        }
        const nextKey = visible[0].target.getAttribute('data-memory-day-key') || '';
        if (nextKey) {
          setActiveMemoryDayKey(nextKey);
        }
      },
      {
        root: null,
        rootMargin: '-20% 0px -58% 0px',
        threshold: [0.2, 0.35, 0.5, 0.7],
      },
    );

    for (const section of memoryStoryDaySections) {
      const node = memoryDaySectionRefs.current[section.key];
      if (node) {
        observer.observe(node);
      }
    }

    return () => {
      observer.disconnect();
    };
  }, [activeTab, memoryStoryDaySections]);

  useEffect(() => {
    if (typeof window === 'undefined' || !import.meta.env.DEV) {
      return undefined;
    }

    window.__tabinaviPdfDebug = {
      runGuide: async (templateId = 'templateA') => {
        const workspace = buildPdfDebugWorkspace(templateId, 0);
        const memberMap = Object.fromEntries((workspace.members || []).map((member) => [member.user_id, member.name]));
        await exportGuidePdf(workspace, memberMap);
        return { ok: true, type: 'guide', templateId };
      },
      runMemories: async (templateId = 'templateA') => {
        const workspace = buildPdfDebugWorkspace(templateId, 0);
        const memberMap = Object.fromEntries((workspace.members || []).map((member) => [member.user_id, member.name]));
        await exportMemoriesPdf(workspace, memberMap);
        return { ok: true, type: 'memories', templateId };
      },
      runStress: async ({ templateId = 'templateA', count = 10, type = 'guide' } = {}) => {
        const safeCount = Math.max(1, Math.min(20, Number(count) || 1));
        for (let index = 0; index < safeCount; index += 1) {
          const workspace = buildPdfDebugWorkspace(templateId, index);
          const memberMap = Object.fromEntries(
            (workspace.members || []).map((member) => [member.user_id, member.name]),
          );
          if (type === 'memories') {
            await exportMemoriesPdf(workspace, memberMap);
          } else if (type === 'both') {
            await exportGuidePdf(workspace, memberMap);
            await exportMemoriesPdf(workspace, memberMap);
          } else {
            await exportGuidePdf(workspace, memberMap);
          }
          await new Promise((resolve) => window.setTimeout(resolve, 120));
        }
        return { ok: true, count: safeCount, templateId, type };
      },
    };

    return () => {
      delete window.__tabinaviPdfDebug;
    };
  }, []);

  useEffect(() => {
    memoryFilesRef.current = memoryFiles;
  }, [memoryFiles]);

  useEffect(() => {
    workspaceRef.current = workspace;
  }, [workspace]);

  useEffect(() => {
    return () => {
      for (const entry of memoryFilesRef.current) {
        if (entry?.previewUrl) {
          URL.revokeObjectURL(entry.previewUrl);
        }
      }
    };
  }, []);

  useEffect(() => {
    if (!draftScopeKey) {
      restoredDraftScopeRef.current = '';
      return;
    }
    if (restoredDraftScopeRef.current === draftScopeKey) {
      return;
    }

    const readDraft = (formKey, fallback) =>
      safeJsonParse(window.localStorage.getItem(composeDraftStorageKey(draftScopeKey, formKey)), fallback);
    const nextItineraryDraft = readDraft('itineraryForm', null);
    const nextGuideDraft = readDraft('guideForm', null);
    const nextMemoryDraft = readDraft('memoryForm', null);
    const nextPrefs = safeJsonParse(window.localStorage.getItem(composePrefStorageKey(draftScopeKey)), null);

    if (nextItineraryDraft && typeof nextItineraryDraft === 'object') {
      setItineraryForm((prev) => ({ ...prev, ...nextItineraryDraft }));
    }
    if (nextGuideDraft && typeof nextGuideDraft === 'object') {
      setGuideForm((prev) => ({
        ...prev,
        ...nextGuideDraft,
        details: Array.isArray(nextGuideDraft.details) ? nextGuideDraft.details : prev.details,
      }));
    }
    if (nextMemoryDraft && typeof nextMemoryDraft === 'object') {
      setMemoryForm((prev) => ({ ...prev, ...nextMemoryDraft }));
    }
    if (nextPrefs && typeof nextPrefs === 'object') {
      if (nextPrefs.previewMode) {
        setPreviewMode(String(nextPrefs.previewMode));
      }
      if (nextPrefs.collapsedPanels && typeof nextPrefs.collapsedPanels === 'object') {
        setCollapsedPanels((prev) => ({
          ...prev,
          ...nextPrefs.collapsedPanels,
        }));
      }
    }

    restoredDraftScopeRef.current = draftScopeKey;
  }, [draftScopeKey]);

  useEffect(() => {
    if (!draftScopeKey) {
      return;
    }
    const timer = window.setTimeout(() => {
      window.localStorage.setItem(
        composeDraftStorageKey(draftScopeKey, 'itineraryForm'),
        JSON.stringify(itineraryForm),
      );
      setDraftSavedAt(new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }));
    }, 450);

    return () => {
      window.clearTimeout(timer);
    };
  }, [draftScopeKey, itineraryForm]);

  useEffect(() => {
    if (!draftScopeKey) {
      return;
    }
    const timer = window.setTimeout(() => {
      window.localStorage.setItem(
        composeDraftStorageKey(draftScopeKey, 'guideForm'),
        JSON.stringify(guideForm),
      );
      setDraftSavedAt(new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }));
    }, 450);

    return () => {
      window.clearTimeout(timer);
    };
  }, [draftScopeKey, guideForm]);

  useEffect(() => {
    if (!draftScopeKey) {
      return;
    }
    const timer = window.setTimeout(() => {
      window.localStorage.setItem(
        composeDraftStorageKey(draftScopeKey, 'memoryForm'),
        JSON.stringify(memoryForm),
      );
      setDraftSavedAt(new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }));
    }, 450);

    return () => {
      window.clearTimeout(timer);
    };
  }, [draftScopeKey, memoryForm]);

  useEffect(() => {
    if (!draftScopeKey || !editingItineraryId) {
      return;
    }
    const timer = window.setTimeout(() => {
      window.localStorage.setItem(
        composeEditDraftStorageKey(draftScopeKey, 'itineraryEditForm', editingItineraryId),
        JSON.stringify(itineraryEditForm),
      );
      setDraftSavedAt(new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }));
    }, 450);

    return () => {
      window.clearTimeout(timer);
    };
  }, [draftScopeKey, editingItineraryId, itineraryEditForm]);

  useEffect(() => {
    if (!draftScopeKey || !editingGuideId) {
      return;
    }
    const timer = window.setTimeout(() => {
      window.localStorage.setItem(
        composeEditDraftStorageKey(draftScopeKey, 'guideEditForm', editingGuideId),
        JSON.stringify(guideEditForm),
      );
      setDraftSavedAt(new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }));
    }, 450);

    return () => {
      window.clearTimeout(timer);
    };
  }, [draftScopeKey, editingGuideId, guideEditForm]);

  useEffect(() => {
    if (!draftScopeKey || !editingMemoryId) {
      return;
    }
    const timer = window.setTimeout(() => {
      window.localStorage.setItem(
        composeEditDraftStorageKey(draftScopeKey, 'memoryEditForm', editingMemoryId),
        JSON.stringify({
          ...memoryEditForm,
          imageCaptions: memoryEditCaptions,
        }),
      );
      setDraftSavedAt(new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }));
    }, 450);

    return () => {
      window.clearTimeout(timer);
    };
  }, [draftScopeKey, editingMemoryId, memoryEditForm, memoryEditCaptions]);

  useEffect(() => {
    if (!draftScopeKey) {
      return;
    }
    const timer = window.setTimeout(() => {
      window.localStorage.setItem(
        composePrefStorageKey(draftScopeKey),
        JSON.stringify({ previewMode, collapsedPanels }),
      );
    }, 250);

    return () => {
      window.clearTimeout(timer);
    };
  }, [draftScopeKey, previewMode, collapsedPanels]);

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

  const clearEditDraft = (formKey, entityId) => {
    if (!draftScopeKey || !entityId) {
      return;
    }
    window.localStorage.removeItem(composeEditDraftStorageKey(draftScopeKey, formKey, entityId));
  };

  const withBusy = async (task) => {
    setBusy(true);
    setError('');
    setInfo('');
    try {
      await task();
    } catch (err) {
      setError(humanizeErrorMessage(err.message || '処理に失敗しました。'));
    } finally {
      setBusy(false);
    }
  };

  const refreshTrips = async (userId, options = {}) => {
    const { apply = true } = options;
    const trips = await listTripsForUser(userId);
    if (apply) {
      setUserTrips(trips);
    }
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
          uiTemplateId: theme.uiTemplateId || DEFAULT_THEME.uiTemplateId,
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
        setError(humanizeErrorMessage(err.message || '旅行情報の更新に失敗しました。'));
      }
    }
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
      setMemoryEditCaptions([]);
      replaceMemoryFiles([]);
      setMemorySearchQuery('');
      setMemorySearchResults([]);
      setMemorySearchSource('');
      return;
    }

    let cancelled = false;

    const initializeUserData = async () => {
      const initMutationVersion = tripMutationVersionRef.current;
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

        const trips = await refreshTrips(user.id, { apply: false });
        if (cancelled) {
          return;
        }

        const hasConcurrentMutation = tripMutationVersionRef.current !== initMutationVersion;
        if (hasConcurrentMutation) {
          setUserTrips((prev) => mergeTripCollections(prev, trips));
          return;
        }

        setUserTrips(trips);
        const savedTripId = window.localStorage.getItem(storageKey(user.id));
        const canOpenSavedTrip = savedTripId && trips.some((trip) => trip.id === savedTripId);

        if (canOpenSavedTrip) {
          setSelectedTripId(savedTripId);
          await loadWorkspace(savedTripId);
        }
      } catch (err) {
        if (!cancelled) {
          setError(humanizeErrorMessage(err.message || '初期データの読み込みに失敗しました。'));
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

    let inFlight = false;
    let timeout = null;
    const unsubscribe = subscribeTripChanges(selectedTripId, () => {
      if (inFlight) {
        return;
      }
      if (timeout) {
        window.clearTimeout(timeout);
      }
      timeout = window.setTimeout(() => {
        inFlight = true;
        fetchTripWorkspace(selectedTripId)
          .then((next) => {
            setWorkspace((prev) => (prev === next ? prev : next));
          })
          .catch(() => {})
          .finally(() => {
            inFlight = false;
          });
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
      setError('再設定コードが見つかりません。メールリンクを開くか、コードを入力してください。');
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
      setError('表示名を入力してください。');
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
      setMemoryEditCaptions([]);
      replaceMemoryFiles([]);
    });
  };

  const handleCreateTrip = (event) => {
    event.preventDefault();

    if (!session?.user) {
      return;
    }

    withBusy(async () => {
      markTripMutation();
      const created = await createTripForUser(session.user.id, {
        ...createForm,
        theme: DEFAULT_THEME,
      });

      setUserTrips((prev) => upsertTripCollection(prev, created));

      setSelectedTripPersisted(session.user.id, created.id);
      setWorkspace(buildOptimisticWorkspace(created, session.user, profile?.display_name || '', 'owner'));
      void loadWorkspace(created.id).catch(() => {});
      setActiveTab('itinerary');
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
      markTripMutation();
      const joined = await joinTripByCode(session.user.id, joinForm.code, joinForm.passphrase);
      setUserTrips((prev) => upsertTripCollection(prev, joined));
      setSelectedTripPersisted(session.user.id, joined.id);
      setWorkspace(buildOptimisticWorkspace(joined, session.user, profile?.display_name || '', 'member'));
      void loadWorkspace(joined.id).catch(() => {});
      setActiveTab('itinerary');
      setJoinForm(defaultJoinForm);
      setInfo('旅行に参加しました。');
    });
  };

  const handleOpenTrip = (tripId) => {
    if (!session?.user) {
      return;
    }

    withBusy(async () => {
      markTripMutation();
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

  const handleLoadDemoTrip = () => {
    if (!session?.user) {
      return;
    }

    withBusy(async () => {
      markTripMutation();
      const existing = userTrips.find((trip) => String(trip.name || '').startsWith('サンプル旅行'));
      if (existing) {
        setSelectedTripPersisted(session.user.id, existing.id);
        await loadWorkspace(existing.id);
        setInfo('サンプル旅行を開きました。');
        return;
      }

      const created = await createTripForUser(session.user.id, {
        name: `サンプル旅行 ${new Date().toLocaleDateString('ja-JP')}`,
        destination: '東京',
        startDate: '2026-03-10',
        endDate: '2026-03-11',
        passphrase: '',
        theme: DEFAULT_THEME,
      });

      setUserTrips((prev) => upsertTripCollection(prev, created));
      setSelectedTripPersisted(session.user.id, created.id);
      setWorkspace(buildOptimisticWorkspace(created, session.user, profile?.display_name || '', 'owner'));
      void loadWorkspace(created.id).catch(() => {});

      for (const entry of DEMO_ITINERARY_FIXTURES) {
        await addItineraryItem(created.id, session.user.id, entry);
      }

      for (const section of DEMO_GUIDE_FIXTURES) {
        await addGuideSection(created.id, {
          title: section.title,
          content: section.content,
          style: section.style,
        });
      }

      for (let idx = 0; idx < DEMO_MEMORY_FIXTURES.length; idx += 1) {
        const memory = DEMO_MEMORY_FIXTURES[idx];
        const files = [createDemoImageFile(`${memory.title}-A`, 180 + idx * 25), createDemoImageFile(`${memory.title}-B`, 240 + idx * 21)].filter(Boolean);
        await addMemory(
          created.id,
          session.user.id,
          {
            date: memory.date,
            title: memory.title,
            content: memory.content,
            imageCaptions: memory.captions,
          },
          files,
        );
      }

      await loadWorkspace(created.id);
      setActiveTab('itinerary');
      setInfo('サンプル旅行を作成しました。すぐに編集とPDF出力を試せます。');
    });
  };

  const handleAddItinerary = (event) => {
    event.preventDefault();
    if (!workspace || !session?.user) {
      return;
    }

    withBusy(async () => {
      const createdItem = await addItineraryItem(workspace.trip.id, session.user.id, itineraryForm);
      if (createdItem?.id) {
        const normalized = normalizeItineraryForWorkspace(createdItem, session.user.id);
        setWorkspace((prev) =>
          prev
            ? {
                ...prev,
                itineraryItems: applyOrderIndex(sortItineraryByOrder([...(prev.itineraryItems || []), normalized])),
              }
            : prev,
        );
      } else {
        void refreshWorkspace(true);
      }
      setItineraryForm(nextItineraryFormAfterCreate(itineraryForm));
      setInfo('予定を追加しました。');
    });
  };

  const handleOneTapItineraryAdd = (templateKey) => {
    if (!workspace || !session?.user) {
      return;
    }
    const template = ITINERARY_QUICK_TEMPLATE_OPTIONS.find((entry) => entry.key === templateKey);
    if (!template) {
      return;
    }

    const input = buildOneTapItineraryInput(workspaceRef.current || workspace, itineraryForm, template);
    withBusy(async () => {
      const createdItem = await addItineraryItem(workspace.trip.id, session.user.id, input);
      if (createdItem?.id) {
        const normalized = normalizeItineraryForWorkspace(createdItem, session.user.id);
        setWorkspace((prev) =>
          prev
            ? {
                ...prev,
                itineraryItems: applyOrderIndex(sortItineraryByOrder([...(prev.itineraryItems || []), normalized])),
              }
            : prev,
        );
      } else {
        void refreshWorkspace(true);
      }

      setItineraryForm((prev) => ({
        ...nextItineraryFormAfterCreate({
          ...prev,
          ...input,
        }),
        title: '',
        notes: '',
      }));
      setInfo(`1クリックで「${template.label}」を追加しました。`);
    });
  };

  const startEditItinerary = (item) => {
    const base = {
      date: item.date || '',
      startTime: item.start_time || '',
      endTime: item.end_time || '',
      title: item.title || '',
      place: item.place || '',
      linkUrl: item.link_url || '',
      icon: item.icon || '📍',
      notes: item.notes || '',
    };
    const restoredDraft = draftScopeKey
      ? safeJsonParse(
          window.localStorage.getItem(composeEditDraftStorageKey(draftScopeKey, 'itineraryEditForm', item.id)),
          null,
        )
      : null;

    setEditingItineraryId(item.id);
    setItineraryEditForm(
      restoredDraft && typeof restoredDraft === 'object'
        ? { ...base, ...restoredDraft }
        : base,
    );
  };

  const cancelEditItinerary = () => {
    clearEditDraft('itineraryEditForm', editingItineraryId);
    setEditingItineraryId('');
    setItineraryEditForm(defaultItineraryForm);
  };

  const saveEditItinerary = (event, itemId) => {
    event.preventDefault();
    withBusy(async () => {
      const updatedItem = await updateItineraryItem(itemId, itineraryEditForm);
      if (updatedItem?.id) {
        const normalized = normalizeItineraryForWorkspace(updatedItem, session?.user?.id || '');
        setWorkspace((prev) =>
          prev
            ? {
                ...prev,
                itineraryItems: applyOrderIndex(
                  sortItineraryByOrder(
                    (prev.itineraryItems || []).map((entry) =>
                      entry.id === itemId ? { ...entry, ...normalized } : entry,
                    ),
                  ),
                ),
              }
            : prev,
        );
      } else {
        void refreshWorkspace(true);
      }
      cancelEditItinerary();
      setInfo('予定を更新しました。');
    });
  };

  const handleDeleteItinerary = (itemId) => {
    withBusy(async () => {
      const currentWorkspace = workspaceRef.current || workspace;
      const currentItems = currentWorkspace?.itineraryItems || [];
      const deletedIndex = currentItems.findIndex((entry) => entry.id === itemId);
      const deletedItem = deletedIndex >= 0 ? currentItems[deletedIndex] : null;
      const deletedId = await deleteItineraryItem(itemId);

      setWorkspace((prev) =>
        prev
          ? {
              ...prev,
              itineraryItems: applyOrderIndex(
                sortItineraryByOrder((prev.itineraryItems || []).filter((entry) => entry.id !== deletedId)),
              ),
            }
          : prev,
      );

      if (deletedItem) {
        setLastDeletedItinerary({
          item: deletedItem,
          index: deletedIndex,
          tripId: currentWorkspace?.trip?.id || '',
        });
      }
      if (editingItineraryId === itemId) {
        clearEditDraft('itineraryEditForm', itemId);
        setEditingItineraryId('');
        setItineraryEditForm(defaultItineraryForm);
      }
      setInfo('予定を削除しました。必要なら「元に戻す」を押してください。');
    });
  };

  const handleUndoDeleteItinerary = () => {
    if (!workspace || !session?.user || !lastDeletedItinerary || lastDeletedItinerary.tripId !== workspace.trip.id) {
      return;
    }

    withBusy(async () => {
      const source = lastDeletedItinerary.item;
      const restored = await addItineraryItem(workspace.trip.id, session.user.id, {
        date: source.date || '',
        startTime: source.start_time || '',
        endTime: source.end_time || '',
        title: source.title || '予定',
        place: source.place || '',
        linkUrl: source.link_url || '',
        icon: source.icon || '📍',
        notes: source.notes || '',
      });

      if (!restored?.id) {
        void refreshWorkspace(true);
        setLastDeletedItinerary(null);
        setInfo('予定を復元しました。');
        return;
      }

      const currentItems = sortItineraryByOrder(workspaceRef.current?.itineraryItems || workspace.itineraryItems || []);
      const insertIndex = Math.min(
        Math.max(0, Number(lastDeletedItinerary.index || 0)),
        currentItems.length,
      );

      const nextItems = [...currentItems];
      nextItems.splice(insertIndex, 0, normalizeItineraryForWorkspace(restored, session.user.id));
      const ordered = applyOrderIndex(nextItems);
      const ids = ordered.map((entry) => entry.id);

      setWorkspace((prev) =>
        prev
          ? {
              ...prev,
              itineraryItems: ordered,
            }
          : prev,
      );

      await reorderItineraryItems(workspace.trip.id, ids);
      setLastDeletedItinerary(null);
      setInfo('予定を元に戻しました。');
    });
  };

  const handleReorderItineraryByIds = (itemIds) => {
    if (!workspace) {
      return;
    }
    withBusy(async () => {
      const currentWorkspace = workspaceRef.current || workspace;
      const sourceItems = sortItineraryByOrder(currentWorkspace.itineraryItems || []);
      const sourceIds = sourceItems.map((entry) => entry.id);
      const itemById = Object.fromEntries(sourceItems.map((entry) => [entry.id, entry]));
      const optimisticItems = itemIds.map((id) => itemById[id]).filter(Boolean);
      const optimisticOrdered = applyOrderIndex(optimisticItems);

      if (optimisticOrdered.length === sourceItems.length) {
        setWorkspace((prev) =>
          prev
            ? {
                ...prev,
                itineraryItems: optimisticOrdered,
              }
            : prev,
        );
      }

      try {
        const confirmedIds = await reorderItineraryItems(workspace.trip.id, itemIds);
        const confirmedSet = new Set(confirmedIds);
        if (confirmedIds.length === sourceItems.length && confirmedSet.size === sourceItems.length) {
          const confirmedOrdered = applyOrderIndex(
            confirmedIds.map((id) => itemById[id]).filter(Boolean),
          );
          setWorkspace((prev) =>
            prev
              ? {
                  ...prev,
                  itineraryItems: confirmedOrdered,
                }
              : prev,
          );
        } else {
          void refreshWorkspace(true);
        }
      } catch (error) {
        setWorkspace((prev) =>
          prev
            ? {
                ...prev,
                itineraryItems: applyOrderIndex(sourceItems.map((entry, index) => ({ ...entry, order_index: index + 1 }))),
              }
            : prev,
        );
        throw error;
      }

      const changed = sourceIds.join(',') !== itemIds.join(',');
      if (!changed) {
        return;
      }
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

  const handleDuplicateItinerary = (item) => {
    if (!workspace || !session?.user) {
      return;
    }

    withBusy(async () => {
      const duplicated = await addItineraryItem(workspace.trip.id, session.user.id, {
        date: item.date || '',
        startTime: item.start_time || '',
        endTime: item.end_time || '',
        title: `${item.title || '予定'}（コピー）`,
        place: item.place || '',
        linkUrl: item.link_url || '',
        icon: item.icon || '📍',
        notes: item.notes || '',
      });

      if (duplicated?.id) {
        const currentItems = sortItineraryByOrder(workspaceRef.current?.itineraryItems || workspace.itineraryItems || []);
        const insertBase = currentItems.findIndex((entry) => entry.id === item.id);
        const insertAt = insertBase >= 0 ? insertBase + 1 : currentItems.length;
        const normalizedDuplicated = normalizeItineraryForWorkspace(duplicated, session.user.id);
        const nextItems = [...currentItems];
        nextItems.splice(insertAt, 0, normalizedDuplicated);
        const orderedItems = applyOrderIndex(nextItems);
        const orderedIds = orderedItems.map((entry) => entry.id);

        setWorkspace((prev) =>
          prev
            ? {
                ...prev,
                itineraryItems: orderedItems,
              }
            : prev,
        );

        await reorderItineraryItems(workspace.trip.id, orderedIds);
      } else {
        void refreshWorkspace(true);
      }
      setInfo('予定を複製しました。');
    });
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

  const scrollToShioriSection = (key) => {
    const node = shioriSectionRefs.current[key];
    if (!node) {
      return;
    }
    setActiveShioriSectionKey(key);
    node.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const scrollToMemoryDaySection = (key) => {
    const node = memoryDaySectionRefs.current[key];
    if (!node) {
      return;
    }
    setActiveMemoryDayKey(key);
    node.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const togglePanel = (key) => {
    setCollapsedPanels((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const openTabWithPanel = (tab, panelKey = '') => {
    setActiveTab(tab);
    if (panelKey) {
      setCollapsedPanels((prev) => ({
        ...prev,
        [panelKey]: false,
      }));
    }
  };

  const replaceMemoryFiles = (files) => {
    const nextEntries = Array.from(files || [])
      .slice(0, 3)
      .map((file, index) => ({
        id: newClientId(`memory_file_${index}`),
        file,
        previewUrl: URL.createObjectURL(file),
        caption: '',
      }));

    setMemoryFiles((prev) => {
      for (const entry of prev) {
        if (entry?.previewUrl) {
          URL.revokeObjectURL(entry.previewUrl);
        }
      }
      return nextEntries;
    });
  };

  const updateMemoryFileCaption = (fileId, caption) => {
    setMemoryFiles((prev) =>
      prev.map((entry) =>
        entry.id === fileId
          ? {
              ...entry,
              caption,
            }
          : entry,
      ),
    );
  };

  const handleAddGuide = (event) => {
    event.preventDefault();
    if (!workspace) {
      return;
    }

    withBusy(async () => {
      const createdSection = await addGuideSection(workspace.trip.id, guideForm);
      if (createdSection?.id) {
        const normalized = normalizeGuideSectionForWorkspace(createdSection);
        setWorkspace((prev) =>
          prev
            ? {
                ...prev,
                guideSections: applyGuideOrderIndex(sortGuideByOrder([...(prev.guideSections || []), normalized])),
              }
            : prev,
        );
      } else {
        void refreshWorkspace(true);
      }
      setGuideForm(defaultGuideForm);
      setGuideCreateDetailDraft(defaultGuideDetailDraft);
      setInfo('しおりセクションを追加しました。');
    });
  };

  const applyGuideTemplateToForm = (templateKey = selectedGuideTemplate) => {
    const found = GUIDE_TEMPLATE_OPTIONS.find((entry) => entry.key === templateKey);
    if (!found) {
      setError('テンプレートを読み込めませんでした。');
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
      setError('行程テンプレートを読み込めませんでした。');
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
    const base = {
      title: section.title || '',
      content: section.content || '',
      variant: style.variant,
      emoji: style.emoji,
      details: style.details,
    };
    const restoredDraft = draftScopeKey
      ? safeJsonParse(
          window.localStorage.getItem(composeEditDraftStorageKey(draftScopeKey, 'guideEditForm', section.id)),
          null,
        )
      : null;

    setEditingGuideId(section.id);
    setGuideEditForm(
      restoredDraft && typeof restoredDraft === 'object'
        ? {
            ...base,
            ...restoredDraft,
            details: Array.isArray(restoredDraft.details) ? restoredDraft.details : base.details,
          }
        : base,
    );
    setGuideDetailDraft(defaultGuideDetailDraft);
  };

  const cancelEditGuide = () => {
    clearEditDraft('guideEditForm', editingGuideId);
    setEditingGuideId('');
    setGuideEditForm(defaultGuideForm);
    setGuideDetailDraft(defaultGuideDetailDraft);
  };

  const saveEditGuide = (event, sectionId) => {
    event.preventDefault();
    withBusy(async () => {
      const updatedSection = await updateGuideSection(sectionId, {
        title: guideEditForm.title,
        content: guideEditForm.content,
        style: {
          variant: guideEditForm.variant,
          emoji: guideEditForm.emoji,
          details: guideEditForm.details || [],
        },
      });
      if (updatedSection?.id) {
        const normalized = normalizeGuideSectionForWorkspace(updatedSection);
        setWorkspace((prev) =>
          prev
            ? {
                ...prev,
                guideSections: sortGuideByOrder(
                  (prev.guideSections || []).map((entry) =>
                    entry.id === sectionId ? { ...entry, ...normalized } : entry,
                  ),
                ),
              }
            : prev,
        );
      } else {
        void refreshWorkspace(true);
      }
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

  const handleReorderGuideByIds = (sectionIds) => {
    const currentWorkspace = workspaceRef.current || workspace;
    if (!currentWorkspace) {
      return;
    }

    withBusy(async () => {
      const sourceSections = sortGuideByOrder(currentWorkspace.guideSections || []);
      const sourceIds = sourceSections.map((entry) => entry.id);
      const sectionById = Object.fromEntries(sourceSections.map((entry) => [entry.id, entry]));
      const optimisticSections = applyGuideOrderIndex(sectionIds.map((id) => sectionById[id]).filter(Boolean));

      if (optimisticSections.length === sourceSections.length) {
        setWorkspace((prev) =>
          prev
            ? {
                ...prev,
                guideSections: optimisticSections,
              }
            : prev,
        );
      }

      try {
        const confirmedIds = await reorderGuideSections(currentWorkspace.trip.id, sectionIds);
        const confirmedSet = new Set(confirmedIds);
        if (confirmedIds.length === sourceSections.length && confirmedSet.size === sourceSections.length) {
          const confirmedSections = applyGuideOrderIndex(confirmedIds.map((id) => sectionById[id]).filter(Boolean));
          setWorkspace((prev) =>
            prev
              ? {
                  ...prev,
                  guideSections: confirmedSections,
                }
              : prev,
          );
        } else {
          void refreshWorkspace(true);
        }
      } catch (error) {
        setWorkspace((prev) =>
          prev
            ? {
                ...prev,
                guideSections: applyGuideOrderIndex(
                  sourceSections.map((entry, index) => ({ ...entry, order_index: index + 1 })),
                ),
              }
            : prev,
        );
        throw error;
      }

      if (sourceIds.join(',') !== sectionIds.join(',')) {
        setInfo('しおりの順番を更新しました。');
      }
    });
  };

  const handleMoveGuide = (sectionId, direction) => {
    const currentWorkspace = workspaceRef.current || workspace;
    if (!currentWorkspace) {
      return;
    }
    const ids = sortGuideByOrder(currentWorkspace.guideSections || []).map((entry) => entry.id);
    const from = ids.indexOf(sectionId);
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
    handleReorderGuideByIds(next);
  };

  const handleDuplicateGuide = (section) => {
    const currentWorkspace = workspaceRef.current || workspace;
    if (!currentWorkspace) {
      return;
    }

    withBusy(async () => {
      const style = normalizeGuideStyle(section.style);
      const duplicated = await addGuideSection(currentWorkspace.trip.id, {
        title: `${section.title || '項目'}（コピー）`,
        content: section.content || '',
        variant: style.variant || 'plain',
        emoji: style.emoji || '📍',
        details: (style.details || []).map((entry) => ({
          label: entry.label || '',
          value: entry.value || '',
        })),
      });

      if (duplicated?.id) {
        const sourceSections = sortGuideByOrder(currentWorkspace.guideSections || []);
        const baseIndex = sourceSections.findIndex((entry) => entry.id === section.id);
        const insertAt = baseIndex >= 0 ? baseIndex + 1 : sourceSections.length;
        const normalized = normalizeGuideSectionForWorkspace(duplicated);
        const nextSections = [...sourceSections];
        nextSections.splice(insertAt, 0, normalized);
        const ordered = applyGuideOrderIndex(nextSections);
        const orderedIds = ordered.map((entry) => entry.id);

        setWorkspace((prev) =>
          prev
            ? {
                ...prev,
                guideSections: ordered,
              }
            : prev,
        );

        await reorderGuideSections(currentWorkspace.trip.id, orderedIds);
      } else {
        void refreshWorkspace(true);
      }

      setInfo('しおりセクションを複製しました。');
    });
  };

  const handleDeleteGuide = (sectionId) => {
    const currentWorkspace = workspaceRef.current || workspace;
    if (!currentWorkspace) {
      return;
    }
    if (!window.confirm('このセクションを削除しますか？')) {
      return;
    }

    withBusy(async () => {
      await deleteGuideSection(sectionId);
      if (editingGuideId === sectionId) {
        clearEditDraft('guideEditForm', sectionId);
        setEditingGuideId('');
        setGuideEditForm(defaultGuideForm);
        setGuideDetailDraft(defaultGuideDetailDraft);
      }
      setWorkspace((prev) =>
        prev
          ? {
              ...prev,
              guideSections: applyGuideOrderIndex(
                sortGuideByOrder((prev.guideSections || []).filter((entry) => entry.id !== sectionId)),
              ),
            }
          : prev,
      );
      void reorderGuideSections(
        currentWorkspace.trip.id,
        sortGuideByOrder((currentWorkspace.guideSections || []).filter((entry) => entry.id !== sectionId)).map(
          (entry) => entry.id,
        ),
      ).catch(() => {});
      setInfo('しおりセクションを削除しました。');
    });
  };

  const handleAddMemory = (event) => {
    event.preventDefault();
    if (!workspace || !session?.user) {
      return;
    }

    withBusy(async () => {
      await addMemory(
        workspace.trip.id,
        session.user.id,
        {
          ...memoryForm,
          imageCaptions: memoryFiles.map((entry) => String(entry.caption || '').trim()),
        },
        memoryFiles.map((entry) => entry.file),
      );
      setMemoryForm(defaultMemoryForm);
      replaceMemoryFiles([]);
      await refreshWorkspace();
      setInfo('思い出を追加しました。');
    });
  };

  const startEditMemory = (memory) => {
    const baseForm = {
      date: memory.date || '',
      title: memory.title || '',
      content: memory.content || '',
    };
    const baseCaptions = Array.isArray(memory.image_captions)
      ? memory.image_captions.map((entry) => String(entry || ''))
      : (memory.image_urls || []).map(() => '');
    const restoredDraft = draftScopeKey
      ? safeJsonParse(
          window.localStorage.getItem(composeEditDraftStorageKey(draftScopeKey, 'memoryEditForm', memory.id)),
          null,
        )
      : null;

    setEditingMemoryId(memory.id);
    setMemoryEditForm(
      restoredDraft && typeof restoredDraft === 'object'
        ? {
            ...baseForm,
            ...restoredDraft,
          }
        : baseForm,
    );
    setMemoryEditCaptions(
      restoredDraft && typeof restoredDraft === 'object' && Array.isArray(restoredDraft.imageCaptions)
        ? restoredDraft.imageCaptions.map((entry) => String(entry || ''))
        : baseCaptions,
    );
  };

  const cancelEditMemory = () => {
    clearEditDraft('memoryEditForm', editingMemoryId);
    setEditingMemoryId('');
    setMemoryEditForm(defaultMemoryForm);
    setMemoryEditCaptions([]);
  };

  const saveEditMemory = (event, memoryId) => {
    event.preventDefault();
    withBusy(async () => {
      await updateMemory(memoryId, {
        ...memoryEditForm,
        imageCaptions: memoryEditCaptions,
      });
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
      if (editingMemoryId === memory.id) {
        clearEditDraft('memoryEditForm', memory.id);
        setEditingMemoryId('');
        setMemoryEditForm(defaultMemoryForm);
        setMemoryEditCaptions([]);
      }
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
      setError('検索キーワード、または対象の思い出を選んでください。');
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
      setError(humanizeErrorMessage(err.message || '類似検索に失敗しました。'));
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
    if (event && typeof event.preventDefault === 'function') {
      event.preventDefault();
    }
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
          uiTemplateId: designForm.uiTemplateId,
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
      setError('先に表紙画像を選択してください。');
      return;
    }

    withBusy(async () => {
      const updatedTrip = await uploadTripCover(workspace.trip.id, coverFile, workspace.trip.cover_image_path || '');
      if (updatedTrip?.id) {
        setWorkspace((prev) =>
          prev
            ? {
                ...prev,
                trip: {
                  ...prev.trip,
                  ...updatedTrip,
                },
              }
            : prev,
        );
      }
      setCoverFile(null);
      await refreshWorkspace(true);
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
      setError('コピーに失敗しました。ブラウザの権限を確認してください。');
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
      setError('共有リンクのコピーに失敗しました。ブラウザの権限を確認してください。');
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
    withBusy(async () => {
      await exportGuidePdf(workspace, memberNameById);
      setInfo('しおりPDFの生成を開始しました。');
    });
  };

  const handleExportMemories = () => {
    if (!workspace) {
      return;
    }
    withBusy(async () => {
      await exportMemoriesPdf(workspace, memberNameById);
      setInfo('思い出PDFの生成を開始しました。');
    });
  };

  if (loading) {
    return (
      <AppShell style={pageThemeStyle}>
        <Container className="page shell">
          <Stack gap="md">
            <p className="status">読み込み中...</p>
          </Stack>
        </Container>
      </AppShell>
    );
  }

  if (!isSupabaseConfigured) {
    return (
      <AppShell style={pageThemeStyle}>
        <Container className="page">
          <Stack gap="lg">
            <header className="hero">
              <p className="eyebrow">Supabase Setup Required</p>
              <h1>環境変数の設定が必要です</h1>
              <p>
                Vercel または `web/.env` に `VITE_SUPABASE_URL` と `VITE_SUPABASE_ANON_KEY` を設定してください。
                設定後に再読み込みすると、ログイン認証と画像アップロードが有効になります。
              </p>
            </header>
          </Stack>
        </Container>
      </AppShell>
    );
  }

  if (!session?.user) {
    return (
      <AppShell style={pageThemeStyle}>
        <Container className="page">
          <Stack gap="lg">
            <header className="hero">
              <p className="eyebrow">足袋navi</p>
              <h1>足袋navi（タビナビ）</h1>
              <p>
                ゲスト開始（会員登録なし）でも、招待コードと合言葉で参加できます。写真はファイルアップロード、しおりはデコレーション編集、PDF出力まで対応しています。
              </p>
            </header>

          <section className="auth-grid one-col">
            <Card as="article" className="panel">
            <div className="switch-row">
              <Button
                type="button"
                className={authMode === 'login' ? 'active small-tab' : 'small-tab'}
                onClick={() => setAuthMode('login')}
              >
                ログイン
              </Button>
              <Button
                type="button"
                className={authMode === 'signup' ? 'active small-tab' : 'small-tab'}
                onClick={() => setAuthMode('signup')}
              >
                サインアップ
              </Button>
            </div>

            <form className="form" onSubmit={handleAuthSubmit}>
              {authMode === 'signup' ? (
                <label>
                  表示名
                  <Input
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
                <Input
                  type="email"
                  required
                  value={authForm.email}
                  onChange={(event) => setAuthForm((prev) => ({ ...prev, email: event.target.value }))}
                  placeholder="you@example.com"
                />
              </label>

              <label>
                パスワード
                <Input
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
                  <Input
                    value={authForm.displayName}
                    onChange={(event) =>
                      setAuthForm((prev) => ({ ...prev, displayName: event.target.value }))
                    }
                    placeholder="例: sample"
                  />
                </label>
              ) : null}

              <Button type="submit" disabled={busy}>
                {authMode === 'signup' ? 'アカウント作成' : 'ログイン'}
              </Button>
              {authMode === 'login' ? (
                <Button type="button" className="secondary" disabled={busy} onClick={handleStartAsGuest}>
                  会員登録せずに始める（ゲスト）
                </Button>
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
                  <Input
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
                  <Input
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
                <Button type="submit" className="secondary" disabled={busy}>
                  再設定リンク/コードを発行
                </Button>
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
                      <Input
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
                    <Input
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
                    <Input
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
                  <Button type="submit" className="secondary" disabled={busy}>
                    パスワードを更新
                  </Button>
                </form>
              ) : (
                <p className="placeholder">
                  再設定コード発行後、またはメール内リンクを開いた後に、ここでパスワードを更新できます。
                </p>
              )}
            </div>
            </Card>
          </section>

          {error ? <p className="status error">{error}</p> : null}
          {info ? <p className="status info">{info}</p> : null}
          </Stack>
        </Container>
      </AppShell>
    );
  }

  return (
    <AppShell style={pageThemeStyle}>
      <Container className="page shell">
        <Stack gap="lg">
          <Card as="header" className="trip-head">
          <div>
            <p className="eyebrow">足袋navi</p>
            <h1>{profile?.display_name || session.user.email}</h1>
            <p>旅行ルームを開くと、すぐ共同編集できます。</p>
          </div>

          <div className="head-actions">
            <Button type="button" className="secondary" onClick={handleLogout}>
              ログアウト
            </Button>
          </div>
          </Card>

          <Grid as="section" cols="sidebar-main" className="workspace-grid">
          <Card as="aside" className="panel side-panel">
          <h2>あなたの旅行</h2>
          <Button tone="secondary" className="demo-button" onClick={handleLoadDemoTrip} disabled={busy}>
            サンプル旅行を読み込む
          </Button>
          <div className="trip-list">
            {userTrips.length === 0 ? (
              <p className="placeholder">まだ旅行がありません。下のフォームから作成できます。</p>
            ) : (
              userTrips.map((trip) => (
                <Button
                  key={trip.id}
                  type="button"
                  className={selectedTripId === trip.id ? 'trip-chip active-chip' : 'trip-chip'}
                  onClick={() => handleOpenTrip(trip.id)}
                >
                  <strong>{trip.name}</strong>
                  <span>{trip.destination}</span>
                  <span>コード: {trip.code}</span>
                  {trip.requires_passphrase ? <span>🔐 合言葉あり</span> : null}
                </Button>
              ))
            )}
          </div>

          <h3>新しい旅行を作成</h3>
          <form className="form" onSubmit={handleCreateTrip}>
            <label>
              旅行名
              <Input
                required
                value={createForm.name}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, name: event.target.value }))}
              />
            </label>

            <label>
              目的地
              <Input
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
                <Input
                  type="date"
                  value={createForm.startDate}
                  onChange={(event) =>
                    setCreateForm((prev) => ({ ...prev, startDate: event.target.value }))
                  }
                />
              </label>
              <label>
                終了日
                <Input
                  type="date"
                  value={createForm.endDate}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, endDate: event.target.value }))}
                />
              </label>
            </div>

            <label>
              合言葉（任意）
              <Input
                value={createForm.passphrase}
                onChange={(event) =>
                  setCreateForm((prev) => ({ ...prev, passphrase: event.target.value }))
                }
                placeholder="設定すると参加時に必要になります"
              />
            </label>

            <Button type="submit" disabled={busy}>
              旅行を作成
            </Button>
          </form>

          <h3>招待コードで参加</h3>
          <p className="placeholder">共有リンクを開くと、ここに招待コードが自動入力されます。</p>
          <form className="form" onSubmit={handleJoinTrip}>
            <label>
              招待コード
              <Input
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
              <Input
                value={joinForm.passphrase}
                onChange={(event) =>
                  setJoinForm((prev) => ({ ...prev, passphrase: event.target.value }))
                }
                placeholder="合言葉"
              />
            </label>

            <Button type="submit" disabled={busy}>
              参加する
            </Button>
          </form>

          <details className="account-panel" open>
            <summary>{isGuestUser ? 'アカウント設定（表示名）' : 'アカウント設定（名前・パスワード）'}</summary>
            <form className="form" onSubmit={handleAccountUpdate}>
              <label>
                表示名
                <Input
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
                  <Input
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
                  <Input
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
                  <Input
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
              <Button type="submit" tone="secondary" disabled={busy}>
                アカウントを更新
              </Button>
            </form>
          </details>

        </Card>

        <Card
          as="section"
          className={`panel main-panel layout-${currentTheme.layoutTemplate || DEFAULT_THEME.layoutTemplate}`}
        >
          {!workspace ? (
            <div className="empty-state">
              <h2>まずは旅行を選びましょう</h2>
              <p>左側の一覧から開くか、新しく作成して始めてください。</p>
            </div>
          ) : (
            <>
              <header className={`decor-cover ${backgroundClass(currentTheme.backgroundStyle)}`}>
                {effectiveCoverImageUrl ? (
                  <img className="decor-cover-image" src={effectiveCoverImageUrl} alt="cover" />
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
                    <Button type="button" onClick={handleCopyInviteCode}>
                      コード: {workspace.trip.code}
                    </Button>
                    <Button type="button" className="secondary" onClick={handleCopyShareLink}>
                      共有リンク
                    </Button>
                    <Button type="button" onClick={handleExportGuide}>
                      しおりPDF
                    </Button>
                    <Button type="button" onClick={handleExportMemories}>
                      思い出PDF
                    </Button>
                    <Button type="button" className="secondary" onClick={handleLeaveWorkspace}>
                      一覧へ戻る
                    </Button>
                  </div>
                </div>
              </header>

              <div className="workspace-shortcuts">
                <Button type="button" className="secondary" onClick={() => openTabWithPanel('itinerary', 'itineraryComposer')}>
                  予定を追加
                </Button>
                <Button type="button" className="secondary" onClick={() => openTabWithPanel('guide', 'guidePreview')}>
                  しおりプレビュー
                </Button>
                <Button type="button" className="secondary" onClick={() => openTabWithPanel('memories', 'memoryComposer')}>
                  思い出を追加
                </Button>
                <Button type="button" onClick={handleExportGuide}>
                  しおりPDF
                </Button>
                <Button type="button" onClick={handleExportMemories}>
                  思い出PDF
                </Button>
              </div>

              <ActiveTemplateFrame className={`ui-template-shell ui-template-${activeTemplate.id}`}>
                {activeTemplate.printStyles ? <style>{`@media print { ${activeTemplate.printStyles} }`}</style> : null}
                <nav className="tabs">
                  <Button
                    type="button"
                    className={activeTab === 'itinerary' ? 'active' : ''}
                    onClick={() => setActiveTab('itinerary')}
                  >
                    計画
                  </Button>
                  <Button
                    type="button"
                    className={activeTab === 'guide' ? 'active' : ''}
                    onClick={() => setActiveTab('guide')}
                  >
                    しおり
                  </Button>
                  <Button
                    type="button"
                    className={activeTab === 'memories' ? 'active' : ''}
                    onClick={() => setActiveTab('memories')}
                  >
                    思い出
                  </Button>
                  <Button
                    type="button"
                    className={activeTab === 'design' ? 'active' : ''}
                    onClick={() => setActiveTab('design')}
                  >
                    デザイン
                  </Button>
                </nav>
                <div className="floating-actions" role="region" aria-label="クイック操作">
                  <div className="floating-actions-main">
                    <Button
                      type="button"
                      className="secondary"
                      onClick={() => openTabWithPanel('itinerary', 'itineraryComposer')}
                    >
                      計画を追加
                    </Button>
                    <Button
                      type="button"
                      className="secondary"
                      onClick={() => openTabWithPanel('guide', 'guideComposer')}
                    >
                      しおり項目を追加
                    </Button>
                    <Button
                      type="button"
                      className="secondary"
                      onClick={() => openTabWithPanel('memories', 'memoryComposer')}
                    >
                      思い出を追加
                    </Button>
                    <Button type="button" onClick={handleExportGuide}>
                      しおりPDF
                    </Button>
                    <Button type="button" onClick={handleExportMemories}>
                      思い出PDF
                    </Button>
                  </div>
                  <div className="floating-actions-context">
                    {activeTab === 'itinerary' ? (
                      <>
                        <label>
                          1クリック追加
                          <select
                            value={selectedItineraryTemplate}
                            onChange={(event) => setSelectedItineraryTemplate(event.target.value)}
                          >
                            {ITINERARY_QUICK_TEMPLATE_OPTIONS.map((entry) => (
                              <option key={`sticky_quick_${entry.key}`} value={entry.key}>
                                {entry.icon} {entry.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <Button
                          type="button"
                          className="secondary"
                          onClick={() => handleOneTapItineraryAdd(selectedItineraryTemplateOption.key)}
                          disabled={busy}
                        >
                          {selectedItineraryTemplateOption.icon} 選択中を追加
                        </Button>
                      </>
                    ) : null}
                    {activeTab === 'guide' ? (
                      <Button type="button" className="secondary" onClick={() => openTabWithPanel('guide', 'guidePreview')}>
                        しおりプレビューへ
                      </Button>
                    ) : null}
                    {activeTab === 'memories' ? (
                      <Button type="button" className="secondary" onClick={() => openTabWithPanel('memories', 'memoryList')}>
                        思い出一覧へ移動
                      </Button>
                    ) : null}
                    {activeTab === 'design' ? (
                      <Button type="button" className="secondary" onClick={handleSaveDesign} disabled={busy}>
                        デザインを保存
                      </Button>
                    ) : null}
                  </div>
                </div>
                {busy ? <p className="subtle-busy">保存中…</p> : null}

                {activeTab === 'itinerary' ? (
                  <section className="content-panel">
                  <h2>旅程を編集</h2>
                  <p className="placeholder">追加 → 並び替え → 編集 → 削除 をこの画面だけで完結できます。</p>
                  <div className="itinerary-command-bar">
                    <div className="itinerary-metrics">
                      <span>{itineraryMetrics.total}件</span>
                      <span>{itineraryMetrics.days}日</span>
                      <span>場所入力 {itineraryMetrics.withPlace}件</span>
                    </div>
                    <div className="itinerary-inline-quick">
                      <label>
                        1クリック追加
                        <select
                          value={selectedItineraryTemplate}
                          onChange={(event) => setSelectedItineraryTemplate(event.target.value)}
                        >
                          {ITINERARY_QUICK_TEMPLATE_OPTIONS.map((entry) => (
                            <option key={`quick_command_${entry.key}`} value={entry.key}>
                              {entry.icon} {entry.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <Button
                        type="button"
                        className="secondary"
                        onClick={() => handleOneTapItineraryAdd(selectedItineraryTemplateOption.key)}
                        disabled={busy}
                      >
                        {selectedItineraryTemplateOption.icon} 選択中を追加
                      </Button>
                    </div>
                    <div className="row-buttons">
                      <Button tone="secondary" onClick={() => togglePanel('itineraryComposer')}>
                        入力欄
                      </Button>
                      <Button tone="secondary" onClick={() => togglePanel('itineraryList')}>
                        一覧
                      </Button>
                      <Button tone="secondary" onClick={() => setPreviewMode('split')}>
                        2ペイン
                      </Button>
                    </div>
                  </div>
                  <div className="editor-toolbar">
                    <div className="editor-mode-group">
                      <Button
                        type="button"
                        className={previewMode === 'split' ? 'active small-tab' : 'small-tab'}
                        onClick={() => setPreviewMode('split')}
                      >
                        2ペイン
                      </Button>
                      <Button
                        type="button"
                        className={previewMode === 'edit' ? 'active small-tab' : 'small-tab'}
                        onClick={() => setPreviewMode('edit')}
                      >
                        編集のみ
                      </Button>
                      <Button
                        type="button"
                        className={previewMode === 'preview' ? 'active small-tab' : 'small-tab'}
                        onClick={() => setPreviewMode('preview')}
                      >
                        プレビューのみ
                      </Button>
                    </div>
                    {draftSavedAt ? <p className="placeholder">下書き自動保存: {draftSavedAt}</p> : null}
                  </div>
                  {lastDeletedItinerary ? (
                    <div className="status info itinerary-undo">
                      予定を削除しました。
                      <Button tone="secondary" onClick={handleUndoDeleteItinerary} disabled={busy}>
                        元に戻す
                      </Button>
                    </div>
                  ) : null}

                  <div className="editor-preview-grid">
                    <div className={`editor-pane editor-pane-edit ${previewMode === 'preview' ? 'pane-hidden-mobile' : ''}`}>
                      <section className="fold-panel">
                        <Button
                          type="button"
                          className="fold-toggle secondary"
                          onClick={() => togglePanel('itineraryComposer')}
                        >
                          {collapsedPanels.itineraryComposer ? '▶' : '▼'} 1. 予定を追加
                        </Button>

                        {!collapsedPanels.itineraryComposer ? (
                          <>
                            <div className="quick-template-panel">
                              <label>
                                テンプレート
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
                              <Button tone="secondary" onClick={() => applyItineraryQuickTemplate()}>
                                入力欄に反映
                              </Button>
                            </div>

                            <div className="itinerary-one-tap-bar">
                              {ITINERARY_QUICK_TEMPLATE_OPTIONS.map((entry) => (
                                <Button
                                  key={`one_tap_${entry.key}`}
                                  tone="secondary"
                                  className="itinerary-one-tap-button"
                                  onClick={() => handleOneTapItineraryAdd(entry.key)}
                                  disabled={busy}
                                >
                                  {entry.icon} {entry.label}
                                </Button>
                              ))}
                            </div>

                            <form className="form" onSubmit={handleAddItinerary}>
                              <div className="row">
                                <label className={requiredFieldClass(itineraryForm.date)}>
                                  日付
                                  <Input
                                    type="date"
                                    value={itineraryForm.date}
                                    onChange={(event) =>
                                      setItineraryForm((prev) => ({ ...prev, date: event.target.value }))
                                    }
                                  />
                                </label>
                                <label className={requiredFieldClass(itineraryForm.startTime)}>
                                  開始
                                  <Input
                                    type="time"
                                    value={itineraryForm.startTime}
                                    onChange={(event) =>
                                      setItineraryForm((prev) => ({ ...prev, startTime: event.target.value }))
                                    }
                                  />
                                </label>
                                <label>
                                  終了
                                  <Input
                                    type="time"
                                    value={itineraryForm.endTime}
                                    onChange={(event) =>
                                      setItineraryForm((prev) => ({ ...prev, endTime: event.target.value }))
                                    }
                                  />
                                </label>
                              </div>

                              <label className={requiredFieldClass(itineraryForm.title)}>
                                予定タイトル
                                <Input
                                  required
                                  value={itineraryForm.title}
                                  onChange={(event) =>
                                    setItineraryForm((prev) => ({ ...prev, title: event.target.value }))
                                  }
                                />
                              </label>

                              <label className={requiredFieldClass(itineraryForm.place)}>
                                場所
                                <Input
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
                                  <Input
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

                              <Button type="submit" disabled={busy}>
                                入力内容で追加
                              </Button>
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
                          </>
                        ) : null}
                      </section>

                      <section className="fold-panel">
                        <Button
                          type="button"
                          className="fold-toggle secondary"
                          onClick={() => togglePanel('itineraryList')}
                        >
                          {collapsedPanels.itineraryList ? '▶' : '▼'} 2. 並び替え・編集
                        </Button>

                        {!collapsedPanels.itineraryList ? (
                          <>
                            <p className="placeholder">
                              カードをドラッグ、または ↑↓ ボタンで順番を変更できます。編集は「編集」から。
                            </p>
                            {itineraryDaySections.length > 1 ? (
                              <div className="day-jump-bar">
                                {itineraryDaySections.map((section) => (
                                  <Button
                                    key={section.key}
                                    type="button"
                                    className="day-jump-chip secondary"
                                    onClick={() => scrollToDaySection(section.key)}
                                  >
                                    {section.label}
                                  </Button>
                                ))}
                              </div>
                            ) : null}

                            <div className="list">
                              {workspace.itineraryItems.length === 0 ? (
                                <p className="placeholder">予定はまだありません。上の入力欄から最初の予定を追加できます。</p>
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
                                              <Button
                                                type="button"
                                                className="secondary"
                                                onClick={() => handleMoveItinerary(item.id, -1)}
                                              >
                                                ↑
                                              </Button>
                                              <Button
                                                type="button"
                                                className="secondary"
                                                onClick={() => handleMoveItinerary(item.id, 1)}
                                              >
                                                ↓
                                              </Button>
                                              <Button
                                                type="button"
                                                className="secondary"
                                                onClick={() => handleDuplicateItinerary(item)}
                                              >
                                                複製
                                              </Button>
                                              {editingItineraryId !== item.id ? (
                                                <Button type="button" onClick={() => startEditItinerary(item)}>
                                                  クイック編集
                                                </Button>
                                              ) : null}
                                              <Button
                                                type="button"
                                                className="danger"
                                                onClick={() => handleDeleteItinerary(item.id)}
                                              >
                                                削除
                                              </Button>
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
                                                  <Input
                                                    type="date"
                                                    value={itineraryEditForm.date}
                                                    onChange={(event) =>
                                                      setItineraryEditForm((prev) => ({ ...prev, date: event.target.value }))
                                                    }
                                                  />
                                                </label>
                                                <label>
                                                  開始
                                                  <Input
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
                                                  <Input
                                                    type="time"
                                                    value={itineraryEditForm.endTime}
                                                    onChange={(event) =>
                                                      setItineraryEditForm((prev) => ({ ...prev, endTime: event.target.value }))
                                                    }
                                                  />
                                                </label>
                                              </div>
                                              <label className={requiredFieldClass(itineraryEditForm.title)}>
                                                予定タイトル
                                                <Input
                                                  required
                                                  value={itineraryEditForm.title}
                                                  onChange={(event) =>
                                                    setItineraryEditForm((prev) => ({ ...prev, title: event.target.value }))
                                                  }
                                                />
                                              </label>
                                              <label>
                                                場所
                                                <Input
                                                  value={itineraryEditForm.place}
                                                  onChange={(event) =>
                                                    setItineraryEditForm((prev) => ({ ...prev, place: event.target.value }))
                                                  }
                                                />
                                              </label>
                                              <details className="itinerary-advanced-edit">
                                                <summary>詳細（アイコン・URL・メモ）</summary>
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
                                                    <Input
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
                                              </details>
                                              <div className="row-buttons">
                                                <Button type="submit" disabled={busy}>
                                                  変更を保存
                                                </Button>
                                                <Button type="button" className="secondary" onClick={cancelEditItinerary}>
                                                  キャンセル
                                                </Button>
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
                          </>
                        ) : null}
                      </section>
                    </div>

                    <aside className={`editor-pane editor-pane-preview ${previewMode === 'edit' ? 'pane-hidden-mobile' : ''}`}>
                      <h3>ライブプレビュー</h3>
                      <p className="placeholder">入力中の内容がここにすぐ反映されます。</p>
                      <div className="list">
                        {itineraryPreviewSections.length === 0 ? (
                          <p className="placeholder">予定を追加すると、ここにプレビューが表示されます。</p>
                        ) : (
                          itineraryPreviewSections.map((section) => (
                            <section key={`preview_${section.key}`} className="day-section">
                              <header className="day-section-head">
                                <h3>
                                  {section.label}
                                  <span>{section.title}</span>
                                </h3>
                              </header>
                              <div className="list">
                                {section.items.map((item) => (
                                  <article
                                    key={`preview_item_${item.id}`}
                                    className={`card itinerary-preview-card ${item.__isPreviewDraft ? 'preview-draft' : ''}`}
                                  >
                                    <h3>
                                      {item.icon || '📍'} {item.title || '(未入力)'}
                                    </h3>
                                    <p>
                                      {formatDateText(item.date)} {item.start_time || '--:--'} - {item.end_time || '--:--'}
                                    </p>
                                    <p>場所: {item.place || '未設定'}</p>
                                    {item.notes ? <p className="note">{item.notes}</p> : null}
                                  </article>
                                ))}
                              </div>
                            </section>
                          ))
                        )}
                      </div>
                    </aside>
                  </div>
                  </section>
                ) : null}

                {activeTab === 'guide' ? (
                  <section className="content-panel">
                  <h2>しおりを編集</h2>
                  <p className="placeholder">迷ったら「テンプレートを選ぶ → 内容を書く → 追加する」の順で進めてください。</p>
                  <div className="guide-workflow-bar">
                    <span>1. テンプレート選択</span>
                    <span>2. 項目を追加</span>
                    <span>3. 仕上がり確認</span>
                  </div>
                  <section className="print-helper">
                    <div className="print-helper-head">
                      <h3>A4で仕上がりを確認</h3>
                      <span>印刷レイアウト対応</span>
                    </div>
                    <p className="placeholder">PDFは印刷ダイアログから保存します。しおり本体と思い出ページを別々に出力できます。</p>
                    <div className="row-buttons">
                      <Button type="button" onClick={handleExportGuide}>
                        しおりPDF
                      </Button>
                      <Button type="button" className="secondary" onClick={handleExportMemories}>
                        思い出PDF
                      </Button>
                    </div>
                  </section>
                  <section className="fold-panel">
                    <Button
                      type="button"
                      className="fold-toggle secondary"
                      onClick={() => togglePanel('guideComposer')}
                    >
                      {collapsedPanels.guideComposer ? '▶' : '▼'} 1. 項目を作る
                    </Button>

                    {!collapsedPanels.guideComposer ? (
                      <form className="form" onSubmit={handleAddGuide}>
                    <div className="quick-template-panel">
                      <label>
                        テンプレート
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
                      <Button type="button" className="secondary" onClick={() => applyGuideTemplateToForm()}>
                        入力欄に反映
                      </Button>
                    </div>
                    <div className="row-buttons">
                      <Button type="button" className="secondary" onClick={applyOverviewTemplateToGuideForm}>
                        旅の概要をすぐ作る
                      </Button>
                    </div>
                    <label>
                      見出し
                      <Input
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
                        <Input
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
                              <Input
                                value={detail.label || ''}
                                onChange={(event) =>
                                  updateGuideFormDetailAt(index, 'label', event.target.value)
                                }
                                placeholder="例: 日付"
                              />
                            </label>
                            <label>
                              内容
                              <Input
                                value={detail.value || ''}
                                onChange={(event) =>
                                  updateGuideFormDetailAt(index, 'value', event.target.value)
                                }
                                placeholder="例: 2026-03-01"
                              />
                            </label>
                            <Button
                              type="button"
                              className="danger"
                              onClick={() => removeGuideFormDetailAt(index)}
                            >
                              削除
                            </Button>
                          </div>
                        ))
                      )}

                      <div className="row guide-detail-row">
                        <label>
                          追加する項目名
                          <Input
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
                          <Input
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
                        <Button type="button" className="secondary" onClick={addGuideDetailToForm}>
                          項目追加
                        </Button>
                      </div>
                    </div>

                    <Button type="submit" disabled={busy}>
                      しおりに追加
                    </Button>
                      </form>
                    ) : null}
                  </section>

                  <section className="fold-panel">
                    <Button
                      type="button"
                      className="fold-toggle secondary"
                      onClick={() => togglePanel('guideList')}
                    >
                      {collapsedPanels.guideList ? '▶' : '▼'} 2. 一覧を編集
                    </Button>

                    {!collapsedPanels.guideList ? (
                      <div className="list">
                    <p className="placeholder">追加した項目はここで「並べ替え」「複製」「編集」「削除」できます。</p>
                    {workspace.guideSections.length === 0 ? (
                      <p className="placeholder">しおりはまだ空です。上の入力欄から追加してください。</p>
                    ) : (
                      sortGuideByOrder(workspace.guideSections || []).map((section) => (
                        <article
                          className={`card guide-card ${section.style?.variant || 'plain'}`}
                          key={section.id}
                        >
                          <div className="card-head">
                            <h3>
                              {section.style?.emoji || '📍'} {section.title}
                            </h3>
                            <div className="row-buttons">
                              <Button
                                type="button"
                                className="secondary"
                                onClick={() => handleMoveGuide(section.id, -1)}
                              >
                                ↑
                              </Button>
                              <Button
                                type="button"
                                className="secondary"
                                onClick={() => handleMoveGuide(section.id, 1)}
                              >
                                ↓
                              </Button>
                              <Button
                                type="button"
                                className="secondary"
                                onClick={() => handleDuplicateGuide(section)}
                              >
                                複製
                              </Button>
                              {editingGuideId !== section.id ? (
                                <Button type="button" onClick={() => startEditGuide(section)}>
                                  内容を編集
                                </Button>
                              ) : null}
                              <Button
                                type="button"
                                className="danger"
                                onClick={() => handleDeleteGuide(section.id)}
                              >
                                削除
                              </Button>
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
                                <Input
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
                                  <Input
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
                                        <Input
                                          value={detail.label || ''}
                                          onChange={(event) =>
                                            updateGuideDetailAt(index, 'label', event.target.value)
                                          }
                                          placeholder="例: 日付"
                                        />
                                      </label>
                                      <label>
                                        内容
                                        <Input
                                          value={detail.value || ''}
                                          onChange={(event) =>
                                            updateGuideDetailAt(index, 'value', event.target.value)
                                          }
                                          placeholder="例: 2026-03-01"
                                        />
                                      </label>
                                      <Button
                                        type="button"
                                        className="danger"
                                        onClick={() => removeGuideDetailAt(index)}
                                      >
                                        削除
                                      </Button>
                                    </div>
                                  ))
                                )}

                                <div className="row guide-detail-row">
                                  <label>
                                    追加する項目名
                                    <Input
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
                                    <Input
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
                                  <Button type="button" className="secondary" onClick={addGuideDetailToEdit}>
                                    項目追加
                                  </Button>
                                </div>
                              </div>

                              <div className="row-buttons">
                                <Button type="submit" disabled={busy}>
                                  変更を保存
                                </Button>
                                <Button type="button" className="secondary" onClick={cancelEditGuide}>
                                  キャンセル
                                </Button>
                              </div>
                            </form>
                          ) : null}
                        </article>
                      ))
                    )}
                      </div>
                    ) : null}
                  </section>

                  <section className="fold-panel shiori-preview-shell">
                    <Button
                      type="button"
                      className="fold-toggle secondary"
                      onClick={() => togglePanel('guidePreview')}
                    >
                      {collapsedPanels.guidePreview ? '▶' : '▼'} 3. 仕上がり確認
                    </Button>

                    {!collapsedPanels.guidePreview ? (
                      <>
                        <nav className="toc-nav" aria-label="しおりセクションナビ">
                          {shioriPreviewSections.map((section) => (
                            <Button
                              key={section.key}
                              type="button"
                              className={`toc-chip secondary ${activeShioriSectionKey === section.key ? 'active' : ''}`}
                              onClick={() => scrollToShioriSection(section.key)}
                              aria-current={activeShioriSectionKey === section.key ? 'location' : undefined}
                            >
                              {section.title}
                              <span>{section.subtitle}</span>
                            </Button>
                          ))}
                        </nav>

                        <div className="shiori-sections">
                          {shioriPreviewSections.map((section) => (
                            <section
                              key={`shiori_${section.key}`}
                              className={`shiori-section ${activeShioriSectionKey === section.key ? 'active' : ''}`}
                              data-section-key={section.key}
                              ref={(node) => {
                                shioriSectionRefs.current[section.key] = node;
                              }}
                            >
                              <header className="shiori-section-head">
                                <h3>{section.title}</h3>
                                <span>{section.subtitle}</span>
                              </header>
                              {section.rows.length === 0 ? (
                                <p className="placeholder">まだ項目がありません。</p>
                              ) : (
                                <div className="shiori-row-list">
                                  {section.rows.map((row) => (
                                    <article key={`${section.key}_${row.id}`} className="shiori-row">
                                      <h4>{row.title}</h4>
                                      {row.meta ? <p>{row.meta}</p> : null}
                                      {row.note ? <p className="note">{row.note}</p> : null}
                                    </article>
                                  ))}
                                </div>
                              )}
                            </section>
                          ))}
                        </div>
                      </>
                    ) : null}
                  </section>
                  </section>
                ) : null}

                {activeTab === 'memories' ? (
                  <section className="content-panel">
                  <h2>思い出</h2>
                  <section className="print-helper">
                    <div className="print-helper-head">
                      <h3>写真ページを印刷する</h3>
                      <span>時系列で整理</span>
                    </div>
                    <p className="placeholder">「思い出PDF」は写真中心レイアウトです。旅程付きのしおりは「しおりPDF」を使ってください。</p>
                    <div className="row-buttons">
                      <Button type="button" className="secondary" onClick={handleExportGuide}>
                        しおりPDF
                      </Button>
                      <Button type="button" onClick={handleExportMemories}>
                        思い出PDF
                      </Button>
                    </div>
                  </section>
                  <form className="form" onSubmit={handleMemorySearch}>
                    <label>
                      AI類似検索（思い出キーワード）
                      <Input
                        value={memorySearchQuery}
                        onChange={(event) => setMemorySearchQuery(event.target.value)}
                        placeholder="例: 温泉、夕日、ロープウェイ"
                      />
                    </label>
                    <div className="row-buttons">
                      <Button type="submit" className="secondary" disabled={memorySearchBusy}>
                        {memorySearchBusy ? '検索中...' : '類似検索する'}
                      </Button>
                      <Button
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
                      </Button>
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
                                  <img src={url} alt="memory" loading="lazy" decoding="async" />
                                </a>
                              ))}
                            </div>
                          ) : null}
                        </article>
                      ))}
                    </div>
                  ) : null}

                  <section className="memories-story-board">
                    <header className="memories-story-head">
                      <h3>思い出ページ（写真中心）</h3>
                      <p className="placeholder">写真と短文を中心に、旅の流れをカードで確認できます。</p>
                    </header>
                    {memoryStoryCards.length === 0 ? (
                      <p className="placeholder">思い出を追加すると、ここに写真カードが並びます。</p>
                    ) : (
                      <div className="memories-story-sections">
                        {memoryStoryDaySections.length > 1 ? (
                          <nav className="memory-day-nav" aria-label="思い出の日別ナビ">
                            {memoryStoryDaySections.map((section) => (
                              <Button
                                key={`memory_day_nav_${section.key}`}
                                type="button"
                                className={`day-jump-chip secondary ${activeMemoryDayKey === section.key ? 'active' : ''}`}
                                onClick={() => scrollToMemoryDaySection(section.key)}
                                aria-current={activeMemoryDayKey === section.key ? 'location' : undefined}
                              >
                                {section.label}
                                <span>{section.items.length}件</span>
                              </Button>
                            ))}
                          </nav>
                        ) : null}

                        {memoryStoryDaySections.map((section) => (
                          <section
                            key={`memory_day_${section.key}`}
                            className={`memory-day-section ${activeMemoryDayKey === section.key ? 'active' : ''}`}
                            data-memory-day-key={section.key}
                            ref={(node) => {
                              memoryDaySectionRefs.current[section.key] = node;
                            }}
                          >
                            <header className="memory-day-section-head">
                              <h4>
                                {section.label}
                                <span>{section.key === 'undated' ? '日付未設定' : formatDateText(section.title)}</span>
                              </h4>
                              <span>{section.items.length}件</span>
                            </header>

                            <div className="memories-story-grid">
                              {section.items.map((card) => (
                                <article key={`story_${card.id}`} className="memory-story-card">
                                  {card.leadImageUrl ? (
                                    <img
                                      src={card.leadImageUrl}
                                      alt={card.title}
                                      className="memory-story-hero"
                                      loading="lazy"
                                      decoding="async"
                                    />
                                  ) : (
                                    <div className="memory-story-hero memory-story-fallback">photo</div>
                                  )}
                                  <div className="memory-story-body">
                                    <div className="memory-story-meta">
                                      <span>{formatDateText(card.date)}</span>
                                      {card.place ? <span>{card.place}</span> : null}
                                      <span>{card.authorName}</span>
                                    </div>
                                    <h4>{card.title}</h4>
                                    <p className="note">{truncateText(card.content, 120) || '本文なし'}</p>
                                    {card.leadCaption ? <p className="memory-caption">{card.leadCaption}</p> : null}
                                    {card.gallery.length > 1 ? (
                                      <div className="memory-story-thumbs">
                                        {card.gallery.slice(1, 4).map((entry) => (
                                          <figure key={`${card.id}_${entry.url}`}>
                                            <img src={entry.url} alt={card.title} loading="lazy" decoding="async" />
                                            {entry.caption ? <figcaption>{entry.caption}</figcaption> : null}
                                          </figure>
                                        ))}
                                      </div>
                                    ) : null}
                                  </div>
                                </article>
                              ))}
                            </div>
                          </section>
                        ))}
                      </div>
                    )}
                  </section>

                  <section className="fold-panel">
                    <Button
                      type="button"
                      className="fold-toggle secondary"
                      onClick={() => togglePanel('memoryComposer')}
                    >
                      {collapsedPanels.memoryComposer ? '▶' : '▼'} 思い出を入力
                    </Button>

                    {!collapsedPanels.memoryComposer ? (
                      <form className="form" onSubmit={handleAddMemory}>
                        <label>
                          日付
                          <Input
                            type="date"
                            value={memoryForm.date}
                            onChange={(event) => setMemoryForm((prev) => ({ ...prev, date: event.target.value }))}
                          />
                        </label>

                        <label className={requiredFieldClass(memoryForm.title)}>
                          タイトル
                          <Input
                            required
                            value={memoryForm.title}
                            onChange={(event) =>
                              setMemoryForm((prev) => ({ ...prev, title: event.target.value }))
                            }
                          />
                        </label>

                        <label className={requiredFieldClass(memoryForm.content)}>
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
                          <Input
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={(event) => replaceMemoryFiles(event.target.files || [])}
                          />
                        </label>

                        {memoryFiles.length > 0 ? (
                          <div className="memory-upload-preview">
                            {memoryFiles.map((entry, index) => (
                              <article className="memory-upload-card" key={entry.id}>
                                <img src={entry.previewUrl} alt={`選択画像${index + 1}`} loading="lazy" decoding="async" />
                                <p>{entry.file.name}</p>
                                <label>
                                  キャプション
                                  <Input
                                    value={entry.caption}
                                    onChange={(event) => updateMemoryFileCaption(entry.id, event.target.value)}
                                    placeholder="例: 夕日がきれいだった場所"
                                  />
                                </label>
                              </article>
                            ))}
                          </div>
                        ) : null}

                        <Button type="submit" disabled={busy}>
                          思い出を追加
                        </Button>
                      </form>
                    ) : null}
                  </section>

                  <section className="fold-panel">
                    <Button
                      type="button"
                      className="fold-toggle secondary"
                      onClick={() => togglePanel('memoryList')}
                    >
                      {collapsedPanels.memoryList ? '▶' : '▼'} 思い出一覧
                    </Button>

                    {!collapsedPanels.memoryList ? (
                      <div className="list">
                    {workspace.memories.length === 0 ? (
                      <p className="placeholder">まだ思い出がありません。写真を1枚追加してみましょう。</p>
                    ) : (
                      workspace.memories.map((memory) => (
                        <article className="card" key={memory.id}>
                          <div className="card-head">
                            <h3>{memory.title}</h3>
                            <div className="row-buttons">
                              <Button
                                type="button"
                                className="secondary"
                                onClick={() => handleMemorySearchFromEntry(memory.id)}
                                disabled={memorySearchBusy}
                              >
                                この内容で類似検索
                              </Button>
                              {editingMemoryId !== memory.id ? (
                                <Button type="button" onClick={() => startEditMemory(memory)}>
                                  編集
                                </Button>
                              ) : null}
                              <Button
                                type="button"
                                className="danger"
                                onClick={() => handleDeleteMemory(memory)}
                              >
                                削除
                              </Button>
                            </div>
                          </div>

                          <p>
                            {formatDateText(memory.date)} / 投稿者: {memberNameById[memory.author_user_id] || '不明'}
                          </p>
                          <p className="note">{memory.content}</p>

                          {(memory.image_urls || []).length ? (
                            <div className="memory-images">
                              {memory.image_urls.map((url, index) => (
                                <div className="memory-image-item" key={url}>
                                  <a href={url} target="_blank" rel="noreferrer">
                                    <img src={url} alt="memory" loading="lazy" decoding="async" />
                                  </a>
                                  {memory.image_captions?.[index] ? (
                                    <p className="memory-caption">{memory.image_captions[index]}</p>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          ) : null}

                          {editingMemoryId === memory.id ? (
                            <form className="form edit-form" onSubmit={(event) => saveEditMemory(event, memory.id)}>
                              <label>
                                日付
                                <Input
                                  type="date"
                                  value={memoryEditForm.date}
                                  onChange={(event) =>
                                    setMemoryEditForm((prev) => ({ ...prev, date: event.target.value }))
                                  }
                                />
                              </label>
                              <label>
                                タイトル
                                <Input
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
                              {(memory.image_urls || []).length > 0 ? (
                                <div className="memory-caption-editor">
                                  <h4>画像キャプション</h4>
                                  {(memory.image_urls || []).map((url, index) => (
                                    <div className="memory-caption-row" key={`${memory.id}_caption_${url}`}>
                                      <img src={url} alt={`caption-${index + 1}`} loading="lazy" decoding="async" />
                                      <Input
                                        value={memoryEditCaptions[index] || ''}
                                        onChange={(event) =>
                                          setMemoryEditCaptions((prev) =>
                                            prev.map((entry, idx) =>
                                              idx === index ? event.target.value : entry,
                                            ),
                                          )
                                        }
                                        placeholder={`画像${index + 1}のキャプション`}
                                      />
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                              <div className="row-buttons">
                                <Button type="submit" disabled={busy}>
                                  保存
                                </Button>
                                <Button type="button" className="secondary" onClick={cancelEditMemory}>
                                  キャンセル
                                </Button>
                              </div>
                            </form>
                          ) : null}
                        </article>
                      ))
                    )}
                      </div>
                    ) : null}
                  </section>
                  </section>
                ) : null}

                {activeTab === 'design' ? (
                  <section className="content-panel">
                    <h2>表紙・テーマをデコレーションする</h2>
                    <div className="preset-grid">
                      {DESIGN_PRESET_OPTIONS.map((entry) => (
                        <Button
                          key={entry.key}
                          type="button"
                          className="secondary preset-button"
                          onClick={() => applyDesignPreset(entry.key)}
                        >
                          <strong>{entry.label}</strong>
                          <span>{entry.sub}</span>
                        </Button>
                      ))}
                    </div>

                    <section className="layout-quick-panel">
                      <div className="layout-quick-headline">
                        <h3>レイアウトをすばやく切り替え</h3>
                        <p className="placeholder">テンプレート・画面レイアウト・PDF形式をまとめて切り替えます。</p>
                      </div>
                      <div className="layout-quick-grid">
                        {LAYOUT_QUICK_OPTIONS.map((entry) => (
                          <Button
                            key={entry.key}
                            type="button"
                            className="layout-quick-option"
                            onClick={() =>
                              setDesignForm((prev) => ({
                                ...prev,
                                ...entry.apply,
                              }))
                            }
                          >
                            <strong>{entry.label}</strong>
                            <span>{entry.description}</span>
                          </Button>
                        ))}
                      </div>
                    </section>

                    <section className="template-picker-panel">
                      <div className="template-picker-headline">
                        <h3>テンプレートを選ぶ</h3>
                        <p className="placeholder">同じデータのまま、見た目だけ切り替えられます。</p>
                      </div>
                      <div className="template-picker-grid">
                        {TEMPLATE_REGISTRY.map((entry) => {
                          const PreviewComponent = entry.PreviewComponent;
                          const selected = designForm.uiTemplateId === entry.id;
                          return (
                            <Button
                              key={entry.id}
                              type="button"
                              className={`template-option ${selected ? 'template-option-active' : ''}`}
                              onClick={() =>
                                setDesignForm((prev) => ({
                                  ...prev,
                                  uiTemplateId: entry.id,
                                  layoutTemplate: entry.defaults.layoutTemplate || prev.layoutTemplate,
                                  pdfTemplate: entry.defaults.pdfTemplate || prev.pdfTemplate,
                                }))
                              }
                            >
                              <div className="template-option-header">
                                <strong>{entry.metadata.name}</strong>
                                <span>{entry.metadata.tone}</span>
                              </div>
                              <p>{entry.metadata.description}</p>
                              <PreviewComponent model={templateModel} />
                            </Button>
                          );
                        })}
                      </div>
                    </section>

                    <section className="design-live-preview-panel">
                      <div className="design-live-preview-head">
                        <h3>適用結果プレビュー</h3>
                        <div className="design-live-badges">
                          <span>{selectedDesignTemplate.metadata.name}</span>
                          <span>{designForm.layoutTemplate}</span>
                          <span>{designForm.pdfTemplate}</span>
                        </div>
                      </div>
                      <p className="placeholder">
                        ここで選択した設定が、画面とPDFの両方に適用されます。
                      </p>
                      <div className="design-live-preview-body">
                        <DesignTemplatePreview model={templateModel} />
                      </div>
                    </section>

                    <div className={`design-preview ${backgroundClass(designForm.backgroundStyle)}`}>
                      {effectiveCoverImageUrl ? (
                        <img
                          src={effectiveCoverImageUrl}
                          alt="cover"
                          className="design-preview-image"
                          loading="lazy"
                          decoding="async"
                        />
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
                      <Input
                        value={designForm.coverTitle}
                        onChange={(event) =>
                          setDesignForm((prev) => ({ ...prev, coverTitle: event.target.value }))
                        }
                      />
                    </label>

                    <label>
                      表紙サブタイトル
                      <Input
                        value={designForm.coverSubtitle}
                        onChange={(event) =>
                          setDesignForm((prev) => ({ ...prev, coverSubtitle: event.target.value }))
                        }
                      />
                    </label>

                    <label>
                      スタンプ文字
                      <Input
                        value={designForm.stampText}
                        onChange={(event) =>
                          setDesignForm((prev) => ({ ...prev, stampText: event.target.value }))
                        }
                      />
                    </label>

                    <div className="row two-col">
                      <label>
                        メインカラー
                        <Input
                          type="color"
                          value={designForm.primaryColor}
                          onChange={(event) =>
                            setDesignForm((prev) => ({ ...prev, primaryColor: event.target.value }))
                          }
                        />
                      </label>

                      <label>
                        アクセントカラー
                        <Input
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

                      <label>
                        UIテンプレート
                        <select
                          value={designForm.uiTemplateId}
                          onChange={(event) =>
                            setDesignForm((prev) => ({ ...prev, uiTemplateId: event.target.value }))
                          }
                        >
                          {TEMPLATE_REGISTRY.map((entry) => (
                            <option key={entry.id} value={entry.id}>
                              {entry.metadata.name}
                            </option>
                          ))}
                        </select>
                      </label>

                      <Button type="submit" disabled={busy}>
                        デザインを保存
                      </Button>
                    </form>

                    <div className="form">
                      <label>
                        表紙画像をアップロード
                        <Input
                          type="file"
                          accept="image/*"
                          onChange={(event) => setCoverFile(event.target.files?.[0] || null)}
                        />
                      </label>
                      {coverFile ? <p className="status info mini">選択中: {coverFile.name}</p> : null}
                      <Button type="button" onClick={handleUploadCover} disabled={busy || !coverFile}>
                        表紙画像を保存
                      </Button>
                    </div>
                  </section>
                ) : null}
              </ActiveTemplateFrame>
            </>
          )}
          </Card>
          </Grid>

          {error ? <p className="status error">{error}</p> : null}
          {info ? <p className="status info">{info}</p> : null}
        </Stack>
      </Container>
    </AppShell>
  );
}

export default App;
