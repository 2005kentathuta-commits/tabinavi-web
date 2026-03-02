/* eslint-disable react-refresh/only-export-components */
function cx(...tokens) {
  return tokens.filter(Boolean).join(' ');
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function parseChecklistFromGuideSections(guideSections) {
  const rows = [];
  for (const section of normalizeArray(guideSections)) {
    const title = String(section?.title || '');
    if (!title.includes('持ち物') && !title.toLowerCase().includes('check')) {
      continue;
    }
    const lines = String(section?.content || '')
      .split('\n')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => entry.replace(/^[-*]\s*/, ''));
    for (const line of lines) {
      rows.push({
        id: `${section.id || 'section'}_${line}`,
        label: line,
        checked: false,
      });
    }
  }
  return rows;
}

export const TRIP_TEMPLATE_MODEL_VERSION = '1.0.0';

export function buildTemplateModel(workspace, memberNameById = {}) {
  if (!workspace?.trip) {
    return {
      version: TRIP_TEMPLATE_MODEL_VERSION,
      trip: null,
      members: [],
      itinerary: [],
      packingList: [],
      reservations: [],
      maps: [],
      photos: [],
      notes: [],
      memories: [],
    };
  }

  const itinerary = normalizeArray(workspace.itineraryItems).map((item) => ({
    id: item.id,
    date: String(item.date || ''),
    startTime: String(item.start_time || ''),
    endTime: String(item.end_time || ''),
    title: String(item.title || ''),
    place: String(item.place || ''),
    linkUrl: String(item.link_url || ''),
    icon: String(item.icon || '📍'),
    notes: String(item.notes || ''),
    ownerUserId: String(item.owner_user_id || ''),
  }));

  const guideSections = normalizeArray(workspace.guideSections).map((section) => ({
    id: section.id,
    title: String(section.title || ''),
    content: String(section.content || ''),
    variant: String(section?.style?.variant || 'plain'),
    emoji: String(section?.style?.emoji || '📍'),
    details: normalizeArray(section?.style?.details).map((detail) => ({
      id: detail.id,
      label: String(detail.label || ''),
      value: String(detail.value || ''),
    })),
  }));

  const memories = normalizeArray(workspace.memories).map((memory) => ({
    id: memory.id,
    date: String(memory.date || ''),
    title: String(memory.title || ''),
    content: String(memory.content || ''),
    imageUrls: normalizeArray(memory.image_urls).map((url) => String(url || '')),
    imageCaptions: normalizeArray(memory.image_captions).map((caption) => String(caption || '')),
    authorUserId: String(memory.author_user_id || ''),
  }));

  const mapLinks = itinerary
    .filter((entry) => entry.linkUrl)
    .map((entry) => ({
      id: entry.id,
      label: entry.title || entry.place || '地図リンク',
      url: entry.linkUrl,
      date: entry.date,
      time: entry.startTime,
    }));

  const reservations = itinerary
    .filter((entry) => ['🏨', '🎫', '🍽️'].includes(entry.icon) || /予約|check/i.test(entry.title))
    .map((entry) => ({
      id: entry.id,
      title: entry.title,
      place: entry.place,
      date: entry.date,
      startTime: entry.startTime,
      note: entry.notes,
    }));

  const photos = memories.flatMap((memory) =>
    memory.imageUrls.map((url, index) => ({
      id: `${memory.id}_${index}`,
      memoryId: memory.id,
      title: memory.title,
      url,
      date: memory.date,
      caption: memory.imageCaptions?.[index] || '',
    })),
  );

  return {
    version: TRIP_TEMPLATE_MODEL_VERSION,
    trip: {
      id: workspace.trip.id,
      name: String(workspace.trip.name || ''),
      destination: String(workspace.trip.destination || ''),
      startDate: String(workspace.trip.start_date || ''),
      endDate: String(workspace.trip.end_date || ''),
      coverTitle: String(workspace.trip.cover_title || ''),
      coverSubtitle: String(workspace.trip.cover_subtitle || ''),
      code: String(workspace.trip.code || ''),
    },
    members: normalizeArray(workspace.members).map((member) => ({
      userId: String(member.user_id || ''),
      name: String(member.name || memberNameById[member.user_id] || 'Traveler'),
      role: String(member.role || 'member'),
    })),
    itinerary,
    packingList: parseChecklistFromGuideSections(guideSections),
    reservations,
    maps: mapLinks,
    photos,
    notes: guideSections,
    memories,
  };
}

function TemplateAFrame({ children, className = '' }) {
  return <div className={cx('template-frame', 'template-frame-a', className)}>{children}</div>;
}

function TemplateBFrame({ children, className = '' }) {
  return <div className={cx('template-frame', 'template-frame-b', className)}>{children}</div>;
}

function TemplateAPreview({ model }) {
  const itineraryCount = model?.itinerary?.length || 0;
  const memoryCount = model?.memories?.length || 0;
  return (
    <div className="template-mini template-mini-a" aria-hidden="true">
      <div className="template-mini-head">Template A</div>
      <div className="template-mini-line">予定 {itineraryCount}件</div>
      <div className="template-mini-line">思い出 {memoryCount}件</div>
      <div className="template-mini-block" />
    </div>
  );
}

function TemplateBPreview({ model }) {
  const mapCount = model?.maps?.length || 0;
  const memberCount = model?.members?.length || 0;
  return (
    <div className="template-mini template-mini-b" aria-hidden="true">
      <div className="template-mini-head">Template B</div>
      <div className="template-mini-chips">
        <span>{memberCount} members</span>
        <span>{mapCount} maps</span>
      </div>
      <div className="template-mini-columns">
        <div />
        <div />
      </div>
    </div>
  );
}

export const TEMPLATE_REGISTRY = [
  {
    id: 'templateA',
    metadata: {
      name: 'Atelier Classic',
      description: '落ち着いた紙面トーン。入力・確認のバランスを重視。',
      tone: 'Classic',
    },
    defaults: {
      layoutTemplate: 'atelier',
      pdfTemplate: 'timeline',
    },
    Component: TemplateAFrame,
    PreviewComponent: TemplateAPreview,
    printStyles: `
      .timeline-grid { grid-template-columns: 1fr; gap: 12px; }
      .timeline-day { break-inside: avoid; page-break-inside: avoid; }
      .timeline-day:not(:last-child) { break-after: page; page-break-after: always; }
      .entry { border-radius: 12px; padding: 12px; }
      .shiori-section { break-inside: avoid; page-break-inside: avoid; }
    `,
  },
  {
    id: 'templateB',
    metadata: {
      name: 'Navigator Board',
      description: '情報密度を高めたボード型。移動・予約・地図の導線を強化。',
      tone: 'Board',
    },
    defaults: {
      layoutTemplate: 'timeline',
      pdfTemplate: 'paper',
    },
    Component: TemplateBFrame,
    PreviewComponent: TemplateBPreview,
    printStyles: `
      .timeline-grid { grid-template-columns: 1fr; }
      .timeline-day { border-color: #9ca3af; }
      .paper-grid { grid-template-columns: 1fr; gap: 8px; }
      .paper-day { break-inside: avoid; page-break-inside: avoid; }
      .paper-day:not(:last-child) { break-after: page; page-break-after: always; }
      .memory-story-card { break-inside: avoid; page-break-inside: avoid; }
    `,
  },
];

export function getTemplateById(templateId) {
  const key = String(templateId || '');
  return TEMPLATE_REGISTRY.find((entry) => entry.id === key) || TEMPLATE_REGISTRY[0];
}
