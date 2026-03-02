import { normalizeTheme } from './travelStore';

const PRINT_READY_TIMEOUT_MS = 15000;
const PRINT_DIALOG_TIMEOUT_MS = 30000;
let printJobQueue = Promise.resolve();

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function nlToBr(value) {
  return escapeHtml(value).replaceAll('\n', '<br/>');
}

function fontCss(theme) {
  if (theme.fontStyle === 'serif') {
    return '"Noto Serif JP", "Hiragino Mincho ProN", serif';
  }
  if (theme.fontStyle === 'hand') {
    return '"Kiwi Maru", "Yu Gothic", sans-serif';
  }
  return '"M PLUS 1p", "Yu Gothic", sans-serif';
}

function printableHtml({ title, bodyHtml, theme }) {
  const fontFamily = fontCss(theme);
  return `
    <!doctype html>
    <html lang="ja">
      <head>
        <meta charset="UTF-8" />
        <title>${escapeHtml(title)}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Kiwi+Maru:wght@400;500;700&family=M+PLUS+1p:wght@400;500;700&family=Noto+Serif+JP:wght@400;600;700&display=swap" rel="stylesheet">
        <style>
          @page {
            size: A4;
            margin: 12mm;
          }

          :root {
            --primary: ${escapeHtml(theme.primaryColor)};
            --accent: ${escapeHtml(theme.accentColor)};
          }

          body {
            font-family: ${fontFamily};
            color: #1f2937;
            line-height: 1.6;
            margin: 0;
          }

          h1 {
            font-size: 25px;
            margin: 0;
          }

          h2 {
            margin: 16px 0 8px;
            font-size: 18px;
            border-bottom: 2px solid var(--primary);
            padding-bottom: 4px;
          }

          h3 {
            margin: 0;
            font-size: 15px;
          }

          p {
            margin: 4px 0;
          }

          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 8px;
            font-size: 12px;
          }

          th,
          td {
            border: 1px solid #d1d5db;
            padding: 6px;
            vertical-align: top;
          }

          th {
            background: #eef2ff;
            text-align: left;
          }

          .cover {
            border: 1px solid #dbeafe;
            border-radius: 16px;
            overflow: hidden;
            margin-bottom: 16px;
          }

          .cover-image {
            width: 100%;
            height: 180px;
            object-fit: cover;
            display: block;
          }

          .cover-fallback {
            height: 180px;
            background: linear-gradient(120deg, var(--primary), var(--accent));
          }

          .cover-body {
            padding: 14px;
            background: #fff;
          }

          .stamp {
            display: inline-block;
            border: 2px solid var(--accent);
            color: var(--accent);
            border-radius: 999px;
            padding: 2px 10px;
            margin-bottom: 6px;
            font-weight: 700;
            font-size: 12px;
          }

          .meta {
            font-size: 12px;
            color: #4b5563;
            margin-bottom: 10px;
          }

          .doc-section {
            margin-top: 14px;
            break-inside: avoid;
          }

          .section-head {
            display: flex;
            justify-content: space-between;
            align-items: baseline;
            gap: 8px;
            margin: 0 0 6px;
          }

          .section-head h2 {
            margin: 0;
            border-bottom: none;
            padding-bottom: 0;
          }

          .section-count {
            font-size: 11px;
            color: #4b5563;
          }

          .toc-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 8px;
          }

          .toc-item {
            border: 1px solid #d1d5db;
            border-radius: 8px;
            padding: 8px;
            font-size: 12px;
            background: #fff;
          }

          .toc-item strong {
            display: block;
            color: #111827;
          }

          .mini-list {
            display: grid;
            gap: 8px;
          }

          .mini-item {
            border-left: 4px solid var(--accent);
            padding: 6px 8px;
            background: #fffbf4;
            border-radius: 8px;
          }

          .mini-item h4 {
            margin: 0;
            font-size: 13px;
          }

          .mini-item p {
            margin: 4px 0 0;
            font-size: 11px;
          }

          .entry {
            border: 1px solid #dbeafe;
            border-radius: 10px;
            padding: 10px;
            margin-bottom: 10px;
            break-inside: avoid;
          }

          .entry.highlight {
            border-left: 6px solid var(--accent);
            background: #fff7ed;
          }

          .entry.note {
            background: #eff6ff;
          }

          .timeline-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 10px;
          }

          .timeline-day {
            border: 1px solid #d1d5db;
            border-radius: 12px;
            padding: 10px;
            background: #fff;
            break-inside: avoid;
          }

          .timeline-day-head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            margin-bottom: 8px;
          }

          .day-badge {
            display: inline-block;
            border-radius: 999px;
            border: 1px solid #111827;
            padding: 2px 10px;
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.04em;
          }

          .timeline-row {
            display: grid;
            grid-template-columns: 64px 1fr;
            gap: 10px;
            margin-bottom: 8px;
          }

          .time-chip {
            background: #111827;
            color: #f9fafb;
            border-radius: 6px;
            font-size: 11px;
            text-align: center;
            font-weight: 700;
            padding: 4px 6px;
            align-self: start;
          }

          .timeline-body {
            border-left: 2px dotted #374151;
            padding-left: 10px;
          }

          .timeline-title {
            margin: 0;
            font-weight: 700;
          }

          .timeline-place {
            font-size: 12px;
            color: #374151;
          }

          .timeline-link {
            font-size: 11px;
            color: #0f5ca8;
            word-break: break-all;
          }

          .timeline-note {
            font-size: 12px;
            color: #1f2937;
            white-space: pre-wrap;
          }

          .day-memo {
            margin-top: 8px;
            border: 1px dashed #9ca3af;
            border-radius: 8px;
            min-height: 54px;
            padding: 8px;
            font-size: 11px;
            color: #6b7280;
          }

          .paper-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 10px;
          }

          .paper-day {
            border: 1px solid #d1d5db;
            border-radius: 8px;
            padding: 10px;
            background: linear-gradient(transparent 27px, rgba(156, 163, 175, 0.2) 28px);
            background-size: 100% 30px;
            break-inside: avoid;
          }

          .paper-item {
            margin-bottom: 8px;
            padding-bottom: 8px;
            border-bottom: 1px dotted #9ca3af;
          }

          .paper-item:last-child {
            border-bottom: none;
          }

          .paper-time {
            font-size: 11px;
            font-weight: 700;
            color: #111827;
          }

          .paper-title {
            font-size: 13px;
            font-weight: 700;
          }

          .photos {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 8px;
            margin-top: 8px;
          }

          .photo {
            width: 100%;
            height: 130px;
            object-fit: cover;
            border-radius: 8px;
            border: 1px solid #dbeafe;
          }

          .album-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 10px;
          }

          .album-card {
            border: 1px solid #d1d5db;
            border-radius: 10px;
            overflow: hidden;
            background: #fff;
            break-inside: avoid;
          }

          .album-hero {
            width: 100%;
            height: 160px;
            object-fit: cover;
            display: block;
          }

          .album-body {
            padding: 10px;
          }

          .album-meta {
            display: flex;
            gap: 6px;
            flex-wrap: wrap;
          }

          .album-meta span {
            font-size: 10px;
            border: 1px solid #d1d5db;
            border-radius: 999px;
            padding: 2px 8px;
            color: #374151;
          }

          .album-caption {
            margin: 4px 0 0;
            font-size: 11px;
            color: #4b5563;
          }

          .album-thumbs {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 6px;
            margin-top: 8px;
          }

          .album-thumbs img {
            width: 100%;
            height: 70px;
            object-fit: cover;
            border-radius: 6px;
            border: 1px solid #dbeafe;
          }

          .album-thumbs figcaption {
            font-size: 10px;
            color: #4b5563;
            margin-top: 2px;
            line-height: 1.3;
          }

          .empty {
            border: 1px dashed #cbd5e1;
            border-radius: 10px;
            padding: 12px;
            color: #64748b;
          }

          @media print {
            a {
              color: inherit;
              text-decoration: none;
            }

            .doc-section,
            .timeline-day,
            .paper-day,
            .album-card {
              break-inside: avoid;
            }
          }
        </style>
      </head>
      <body>
        ${bodyHtml}
      </body>
    </html>
  `;
}

function fallbackPopupPrint(html, title) {
  if (typeof window === 'undefined') {
    throw new Error('ブラウザ環境で実行してください。');
  }
  const popup = window.open('', '_blank', 'noopener,noreferrer,width=980,height=760');
  if (!popup) {
    throw new Error('印刷ウィンドウを開けませんでした。ポップアップ許可を確認してください。');
  }

  popup.document.write(html);
  popup.document.close();
  const popupTitle = escapeHtml(title);
  popup.document.title = popupTitle;
  return waitForDocumentComplete(popup)
    .then(() => waitForWindowAssets(popup))
    .catch(() => {})
    .then(async () => {
      try {
        popup.focus();
        popup.print();
      } catch {
        // noop
      }

      await waitForAfterPrint(popup, PRINT_DIALOG_TIMEOUT_MS);

      window.setTimeout(() => {
        try {
          popup.close();
        } catch {
          // noop
        }
      }, 600);
    });
}

function withTimeout(promise, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error('print-timeout'));
    }, timeoutMs);

    Promise.resolve(promise)
      .then((value) => {
        window.clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        window.clearTimeout(timer);
        reject(error);
      });
  });
}

function waitForDocumentComplete(win) {
  const doc = win?.document;
  if (!doc || doc.readyState === 'complete') {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const done = () => {
      doc.removeEventListener('readystatechange', onReadyStateChange);
      win.removeEventListener('load', done);
      resolve();
    };
    const onReadyStateChange = () => {
      if (doc.readyState === 'complete') {
        done();
      }
    };

    doc.addEventListener('readystatechange', onReadyStateChange);
    win.addEventListener('load', done, { once: true });
    window.setTimeout(done, PRINT_READY_TIMEOUT_MS);
  });
}

function waitForWindowAssets(win) {
  const doc = win?.document;
  if (!doc) {
    return Promise.resolve();
  }

  const fontReady = doc.fonts?.ready ? doc.fonts.ready.catch(() => {}) : Promise.resolve();
  const images = Array.from(doc.images || []);
  const imageReady = Promise.all(
    images.map((image) => {
      if (image.complete) {
        return image.decode ? image.decode().catch(() => {}) : Promise.resolve();
      }
      return new Promise((resolve) => {
        const done = () => {
          image.removeEventListener('load', done);
          image.removeEventListener('error', done);
          if (image.decode) {
            image.decode().catch(() => {}).finally(resolve);
            return;
          }
          resolve();
        };
        image.addEventListener('load', done, { once: true });
        image.addEventListener('error', done, { once: true });
        window.setTimeout(done, PRINT_READY_TIMEOUT_MS);
      });
    }),
  );

  const rafSync = new Promise((resolve) => {
    const step = () => {
      const raf = win.requestAnimationFrame || window.requestAnimationFrame;
      raf(() => raf(resolve));
    };
    step();
  });

  return withTimeout(Promise.all([fontReady, imageReady, rafSync]), PRINT_READY_TIMEOUT_MS).catch(() => {});
}

function waitForAfterPrint(win, timeoutMs = PRINT_DIALOG_TIMEOUT_MS) {
  return new Promise((resolve) => {
    let settled = false;
    let mediaQuery = null;
    let mediaHandler = null;
    const isAutomation =
      Boolean(win?.navigator?.webdriver) ||
      Boolean(typeof navigator !== 'undefined' && navigator?.webdriver);
    const effectiveTimeout = isAutomation ? 1200 : timeoutMs;

    const done = () => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(timer);
      try {
        win.removeEventListener('afterprint', done);
      } catch {
        // noop
      }
      if (mediaQuery && mediaHandler) {
        try {
          if (typeof mediaQuery.removeEventListener === 'function') {
            mediaQuery.removeEventListener('change', mediaHandler);
          } else if (typeof mediaQuery.removeListener === 'function') {
            mediaQuery.removeListener(mediaHandler);
          }
        } catch {
          // noop
        }
      }
      resolve();
    };

    const timer = window.setTimeout(done, effectiveTimeout);

    try {
      win.addEventListener('afterprint', done, { once: true });
    } catch {
      // noop
    }

    try {
      if (typeof win.matchMedia === 'function') {
        mediaQuery = win.matchMedia('print');
        mediaHandler = (event) => {
          if (!event.matches) {
            done();
          }
        };
        if (typeof mediaQuery.addEventListener === 'function') {
          mediaQuery.addEventListener('change', mediaHandler);
        } else if (typeof mediaQuery.addListener === 'function') {
          mediaQuery.addListener(mediaHandler);
        }
      }
    } catch {
      // noop
    }
  });
}

function enqueuePrintJob(job) {
  printJobQueue = printJobQueue.then(job, job);
  return printJobQueue;
}

function printWithIframe(html, title) {
  if (typeof document === 'undefined' || !document.body) {
    throw new Error('ブラウザ環境で実行してください。');
  }

  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.position = 'fixed';
    frame.style.right = '0';
    frame.style.bottom = '0';
    frame.style.width = '1px';
    frame.style.height = '1px';
    frame.style.opacity = '0';
    frame.style.pointerEvents = 'none';

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) {
        return;
      }
      cleaned = true;
      window.setTimeout(() => {
        if (frame.parentNode) {
          frame.parentNode.removeChild(frame);
        }
      }, 1000);
    };

    frame.onload = async () => {
      const win = frame.contentWindow;
      if (!win) {
        cleanup();
        fallbackPopupPrint(html, title).then(resolve).catch(reject);
        return;
      }

      await waitForDocumentComplete(win);
      await waitForWindowAssets(win);

      try {
        win.focus();
        win.print();
        await waitForAfterPrint(win, PRINT_DIALOG_TIMEOUT_MS);
        cleanup();
        resolve();
      } catch {
        cleanup();
        fallbackPopupPrint(html, title).then(resolve).catch(reject);
      }
    };

    try {
      document.body.appendChild(frame);
      frame.srcdoc = html;
    } catch (error) {
      cleanup();
      fallbackPopupPrint(html, title).then(resolve).catch(() => reject(error));
    }
  });
}

function openPrintableDocument({ title, bodyHtml, theme }) {
  const html = printableHtml({ title, bodyHtml, theme });
  return enqueuePrintJob(async () => {
    try {
      await printWithIframe(html, title);
    } catch (error) {
      console.error('[pdf] print failed', error);
      throw error;
    }
  });
}

function coverHtml(workspace) {
  const theme = normalizeTheme(workspace.trip.theme);
  const coverImage = workspace.trip.cover_image_url
    ? `<img class="cover-image" src="${escapeHtml(workspace.trip.cover_image_url)}" alt="cover"/>`
    : '<div class="cover-fallback"></div>';

  return `
    <section class="cover">
      ${coverImage}
      <div class="cover-body">
        <div class="stamp">${escapeHtml(theme.stampText || '足袋navi')}</div>
        <h1>${escapeHtml(workspace.trip.cover_title || workspace.trip.name)}</h1>
        <p>${escapeHtml(workspace.trip.cover_subtitle || workspace.trip.destination)}</p>
      </div>
    </section>
  `;
}

function sortedItineraryItems(items) {
  return [...(items || [])].sort((a, b) => {
    const aDate = String(a.date || '9999-99-99');
    const bDate = String(b.date || '9999-99-99');
    if (aDate !== bDate) {
      return aDate.localeCompare(bDate);
    }

    const aTime = String(a.start_time || '99:99');
    const bTime = String(b.start_time || '99:99');
    if (aTime !== bTime) {
      return aTime.localeCompare(bTime);
    }

    const aOrder = Number(a.order_index || 0);
    const bOrder = Number(b.order_index || 0);
    return aOrder - bOrder;
  });
}

function groupItineraryByDay(items) {
  const grouped = new Map();
  for (const item of sortedItineraryItems(items)) {
    const key = item.date || '日付未設定';
    const list = grouped.get(key) || [];
    list.push(item);
    grouped.set(key, list);
  }
  return [...grouped.entries()].map(([date, dayItems], index) => ({
    dayLabel: date === '日付未設定' ? 'FREE' : `DAY ${index + 1}`,
    date,
    items: dayItems,
  }));
}

function itineraryTableHtml(items, memberNameById) {
  const rows = sortedItineraryItems(items)
    .map(
      (item) => `
      <tr>
        <td>${escapeHtml(item.date || '-')}</td>
        <td>${escapeHtml(item.start_time || '-')} - ${escapeHtml(item.end_time || '-')}</td>
        <td>${escapeHtml(item.icon || '📍')} ${escapeHtml(item.title || '-')}</td>
        <td>${escapeHtml(item.place || '-')}</td>
        <td>${
          item.link_url
            ? `<a href="${escapeHtml(item.link_url)}" target="_blank" rel="noreferrer">${escapeHtml(item.link_url)}</a>`
            : '-'
        }</td>
        <td>${nlToBr(item.notes || '-')}</td>
        <td>${escapeHtml(memberNameById[item.owner_user_id] || '-')}</td>
      </tr>
    `,
    )
    .join('');

  return `
    <table>
      <thead>
        <tr>
          <th>日付</th>
          <th>時間</th>
          <th>予定</th>
          <th>場所</th>
          <th>リンク</th>
          <th>メモ</th>
          <th>担当</th>
        </tr>
      </thead>
      <tbody>
        ${rows || '<tr><td colspan="7">予定はまだありません。</td></tr>'}
      </tbody>
    </table>
  `;
}

function itineraryTimelineHtml(items) {
  const days = groupItineraryByDay(items);
  if (days.length === 0) {
    return '<div class="empty">予定はまだありません。</div>';
  }

  return `
    <div class="timeline-grid">
      ${days
        .map(
          (day) => `
        <section class="timeline-day">
          <div class="timeline-day-head">
            <span class="day-badge">${escapeHtml(day.dayLabel)}</span>
            <strong>${escapeHtml(day.date)}</strong>
          </div>
          ${day.items
            .map(
              (item) => `
            <article class="timeline-row">
              <div class="time-chip">${escapeHtml(item.start_time || '--:--')}</div>
              <div class="timeline-body">
                <p class="timeline-title">${escapeHtml(item.icon || '📍')} ${escapeHtml(item.title || '無題')}</p>
                ${item.place ? `<p class="timeline-place">${escapeHtml(item.place)}</p>` : ''}
                ${
                  item.link_url
                    ? `<p class="timeline-link">${escapeHtml(item.link_url)}</p>`
                    : ''
                }
                ${item.notes ? `<p class="timeline-note">${nlToBr(item.notes)}</p>` : ''}
              </div>
            </article>
          `,
            )
            .join('')}
          <div class="day-memo">memo</div>
        </section>
      `,
        )
        .join('')}
    </div>
  `;
}

function itineraryPaperHtml(items) {
  const days = groupItineraryByDay(items);
  if (days.length === 0) {
    return '<div class="empty">予定はまだありません。</div>';
  }

  return `
    <div class="paper-grid">
      ${days
        .map(
          (day) => `
        <section class="paper-day">
          <div class="timeline-day-head">
            <span class="day-badge">${escapeHtml(day.dayLabel)}</span>
            <strong>${escapeHtml(day.date)}</strong>
          </div>
          ${day.items
            .map(
              (item) => `
            <article class="paper-item">
              <div class="paper-time">${escapeHtml(item.start_time || '--:--')} - ${escapeHtml(item.end_time || '--:--')}</div>
              <div class="paper-title">${escapeHtml(item.icon || '📍')} ${escapeHtml(item.title || '無題')}</div>
              ${item.place ? `<p>${escapeHtml(item.place)}</p>` : ''}
              ${item.notes ? `<p>${nlToBr(item.notes)}</p>` : ''}
            </article>
          `,
            )
            .join('')}
          <div class="day-memo">memo</div>
        </section>
      `,
        )
        .join('')}
    </div>
  `;
}

function itineraryByTemplate(theme, items, memberNameById) {
  const template = String(theme.pdfTemplate || 'timeline');
  if (template === 'table') {
    return itineraryTableHtml(items, memberNameById);
  }
  if (template === 'paper') {
    return itineraryPaperHtml(items);
  }
  return itineraryTimelineHtml(items);
}

function sectionHeadHtml(title, countLabel = '') {
  return `
    <div class="section-head">
      <h2>${escapeHtml(title)}</h2>
      ${countLabel ? `<span class="section-count">${escapeHtml(countLabel)}</span>` : ''}
    </div>
  `;
}

function deriveReservations(itineraryItems = []) {
  return sortedItineraryItems(itineraryItems).filter(
    (entry) =>
      ['🏨', '🎫', '🍽️'].includes(String(entry.icon || '')) ||
      /予約|check/i.test(String(entry.title || '')),
  );
}

function parsePackingItems(guideSections = []) {
  const rows = [];
  for (const section of guideSections) {
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
      rows.push(line);
    }
  }
  return rows;
}

function memoryPlaceHint(memory, itineraryItems = []) {
  const sameDay = sortedItineraryItems(itineraryItems).find(
    (entry) => String(entry.date || '') === String(memory.date || ''),
  );
  return sameDay?.place || '';
}

function guideTocHtml(summaryRows) {
  return `
    <div class="toc-grid">
      ${summaryRows
        .map(
          (row) => `
            <div class="toc-item">
              <strong>${escapeHtml(row.title)}</strong>
              <span>${escapeHtml(row.countLabel)}</span>
            </div>
          `,
        )
        .join('')}
    </div>
  `;
}

function memoriesAlbumHtml(memories, itineraryItems, memberNameById) {
  if (!memories.length) {
    return '<p class="empty">思い出はまだ登録されていません。</p>';
  }

  return `
    <div class="album-grid">
      ${memories
        .map((memory) => {
          const imageUrls = Array.isArray(memory.image_urls) ? memory.image_urls : [];
          const imageCaptions = Array.isArray(memory.image_captions) ? memory.image_captions : [];
          const leadImage = imageUrls[0] || '';
          const place = memoryPlaceHint(memory, itineraryItems);
          const extraImages = imageUrls.slice(1, 4);
          const leadCaption = imageCaptions[0] || '';
          return `
            <article class="album-card">
              ${leadImage ? `<img class="album-hero" src="${escapeHtml(leadImage)}" alt="memory"/>` : ''}
              <div class="album-body">
                <div class="album-meta">
                  <span>${escapeHtml(memory.date || '-')}</span>
                  ${place ? `<span>${escapeHtml(place)}</span>` : ''}
                  <span>${escapeHtml(memberNameById[memory.author_user_id] || '-')}</span>
                </div>
                <h3>${escapeHtml(memory.title || '無題')}</h3>
                <p>${nlToBr(memory.content || '')}</p>
                ${leadCaption ? `<p class="album-caption">${escapeHtml(leadCaption)}</p>` : ''}
                ${
                  extraImages.length
                    ? `<div class="album-thumbs">
                        ${extraImages
                          .map(
                            (url, index) => `
                              <figure>
                                <img src="${escapeHtml(url)}" alt="memory"/>
                                ${
                                  imageCaptions[index + 1]
                                    ? `<figcaption>${escapeHtml(imageCaptions[index + 1])}</figcaption>`
                                    : ''
                                }
                              </figure>
                            `,
                          )
                          .join('')}
                      </div>`
                    : ''
                }
              </div>
            </article>
          `;
        })
        .join('')}
    </div>
  `;
}

export function exportGuidePdf(workspace, memberNameById) {
  const theme = normalizeTheme(workspace.trip.theme);
  const reservations = deriveReservations(workspace.itineraryItems || []);
  const packingItems = parsePackingItems(workspace.guideSections || []);
  const members = workspace.members || [];
  const memories = workspace.memories || [];
  const summaryRows = [
    { title: '旅程', countLabel: `${(workspace.itineraryItems || []).length}件` },
    { title: '予約', countLabel: `${reservations.length}件` },
    { title: '持ち物', countLabel: `${packingItems.length}件` },
    { title: 'メンバー', countLabel: `${members.length}名` },
    { title: 'メモ', countLabel: `${(workspace.guideSections || []).length}件` },
    { title: '思い出', countLabel: `${memories.length}件` },
  ];

  const guideRows = workspace.guideSections
    .map((section) => {
      const style = section.style || {};
      const variant = escapeHtml(style.variant || 'plain');
      const emoji = escapeHtml(style.emoji || '📍');
      const detailRows = (Array.isArray(style.details) ? style.details : [])
        .map((detail) => {
          const label = escapeHtml(detail?.label || '項目');
          const value = nlToBr(detail?.value || '未入力');
          return `<tr><th>${label}</th><td>${value}</td></tr>`;
        })
        .join('');
      return `
        <div class="entry ${variant}">
          <h3>${emoji} ${escapeHtml(section.title)}</h3>
          <p>${nlToBr(section.content || '')}</p>
          ${detailRows ? `<table><tbody>${detailRows}</tbody></table>` : ''}
        </div>
      `;
    })
    .join('');

  const reservationRows = reservations
    .map(
      (entry) => `
      <article class="mini-item">
        <h4>${escapeHtml(entry.icon || '📌')} ${escapeHtml(entry.title || '予約')}</h4>
        <p>${escapeHtml(entry.date || '-')} ${escapeHtml(entry.start_time || '--:--')} / ${escapeHtml(entry.place || '場所未設定')}</p>
        ${entry.notes ? `<p>${nlToBr(entry.notes)}</p>` : ''}
      </article>
    `,
    )
    .join('');

  const packingRows = packingItems
    .map(
      (entry) => `
      <article class="mini-item">
        <h4>${escapeHtml(entry)}</h4>
      </article>
    `,
    )
    .join('');

  const memberRows = members
    .map(
      (member) => `
      <article class="mini-item">
        <h4>${escapeHtml(member.name || 'Traveler')}</h4>
        <p>${escapeHtml(member.role || 'member')}</p>
      </article>
    `,
    )
    .join('');

  const bodyHtml = `
    ${coverHtml(workspace)}

    <div class="meta">
      <p>目的地: ${escapeHtml(workspace.trip.destination)}</p>
      <p>日程: ${escapeHtml(workspace.trip.start_date || '-')} 〜 ${escapeHtml(workspace.trip.end_date || '-')}</p>
      <p>参加者: ${escapeHtml(workspace.members.map((member) => member.name).join(', '))}</p>
      <p>招待コード: ${escapeHtml(workspace.trip.code)}</p>
    </div>

    <section class="doc-section">
      ${sectionHeadHtml('目次', `${summaryRows.length}セクション`)}
      ${guideTocHtml(summaryRows)}
    </section>

    <section class="doc-section">
      ${sectionHeadHtml('旅程', `${(workspace.itineraryItems || []).length}件`)}
      ${itineraryByTemplate(theme, workspace.itineraryItems, memberNameById)}
    </section>

    <section class="doc-section">
      ${sectionHeadHtml('予約', `${reservations.length}件`)}
      ${reservationRows ? `<div class="mini-list">${reservationRows}</div>` : '<p class="empty">予約情報はありません。</p>'}
    </section>

    <section class="doc-section">
      ${sectionHeadHtml('持ち物', `${packingItems.length}件`)}
      ${packingRows ? `<div class="mini-list">${packingRows}</div>` : '<p class="empty">持ち物リストは未入力です。</p>'}
    </section>

    <section class="doc-section">
      ${sectionHeadHtml('メンバー', `${members.length}名`)}
      ${memberRows ? `<div class="mini-list">${memberRows}</div>` : '<p class="empty">メンバー情報はありません。</p>'}
    </section>

    <section class="doc-section">
      ${sectionHeadHtml('メモ', `${(workspace.guideSections || []).length}件`)}
      ${guideRows || '<p class="empty">しおりメモはまだありません。</p>'}
    </section>

    <section class="doc-section">
      ${sectionHeadHtml('思い出', `${memories.length}件`)}
      ${memoriesAlbumHtml(memories, workspace.itineraryItems || [], memberNameById)}
    </section>
  `;

  return openPrintableDocument({
    title: `${workspace.trip.name} 足袋naviしおり`,
    bodyHtml,
    theme,
  });
}

export function exportMemoriesPdf(workspace, memberNameById) {
  const theme = normalizeTheme(workspace.trip.theme);
  const memories = workspace.memories || [];
  const dayCount = new Set(memories.map((memory) => String(memory.date || ''))).size;

  const bodyHtml = `
    ${coverHtml(workspace)}

    <div class="meta">
      <p>目的地: ${escapeHtml(workspace.trip.destination)}</p>
      <p>作成日: ${escapeHtml(new Date().toLocaleDateString('ja-JP'))}</p>
    </div>

    <section class="doc-section">
      ${sectionHeadHtml('目次', '2セクション')}
      ${guideTocHtml([
        { title: '思い出アルバム', countLabel: `${memories.length}件` },
        { title: '日付サマリー', countLabel: `${dayCount}日` },
      ])}
    </section>

    <section class="doc-section">
      ${sectionHeadHtml('思い出アルバム', `${memories.length}件`)}
      ${memoriesAlbumHtml(memories, workspace.itineraryItems || [], memberNameById)}
    </section>

    <section class="doc-section">
      ${sectionHeadHtml('日付サマリー', `${dayCount}日`)}
      ${
        memories.length
          ? `<div class="mini-list">
              ${[...new Map(memories.map((entry) => [String(entry.date || '日付未設定'), entry])).keys()]
                .map(
                  (dateKey) => `
                  <article class="mini-item">
                    <h4>${escapeHtml(dateKey || '日付未設定')}</h4>
                    <p>${
                      memories.filter((entry) => String(entry.date || '日付未設定') === dateKey).length
                    }件の思い出</p>
                  </article>
                `,
                )
                .join('')}
            </div>`
          : '<p class="empty">思い出はまだ登録されていません。</p>'
      }
    </section>
  `;

  return openPrintableDocument({
    title: `${workspace.trip.name} 思い出アルバム`,
    bodyHtml,
    theme,
  });
}
