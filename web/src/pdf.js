import { normalizeTheme } from './travelStore';

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
  const popup = window.open('', '_blank', 'noopener,noreferrer,width=980,height=760');
  if (!popup) {
    throw new Error('印刷ウィンドウを開けませんでした。ポップアップ許可を確認してください。');
  }

  popup.document.write(html);
  popup.document.close();
  const popupTitle = escapeHtml(title);
  popup.document.title = popupTitle;
  popup.onload = () => {
    try {
      popup.focus();
      popup.print();
    } catch {
      // noop
    }
  };
}

function openPrintableDocument({ title, bodyHtml, theme }) {
  const html = printableHtml({ title, bodyHtml, theme });

  try {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.position = 'fixed';
    frame.style.right = '0';
    frame.style.bottom = '0';
    frame.style.width = '1px';
    frame.style.height = '1px';
    frame.style.opacity = '0';
    frame.style.pointerEvents = 'none';

    const cleanup = () => {
      window.setTimeout(() => {
        if (frame.parentNode) {
          frame.parentNode.removeChild(frame);
        }
      }, 1000);
    };

    frame.onload = () => {
      const win = frame.contentWindow;
      if (!win) {
        cleanup();
        fallbackPopupPrint(html, title);
        return;
      }

      const afterPrint = () => cleanup();
      win.addEventListener('afterprint', afterPrint, { once: true });
      window.setTimeout(() => {
        try {
          win.focus();
          win.print();
          window.setTimeout(cleanup, 15000);
        } catch {
          cleanup();
          fallbackPopupPrint(html, title);
        }
      }, 250);
    };

    document.body.appendChild(frame);
    frame.srcdoc = html;
  } catch {
    fallbackPopupPrint(html, title);
  }
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

export function exportGuidePdf(workspace, memberNameById) {
  const theme = normalizeTheme(workspace.trip.theme);

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

  const bodyHtml = `
    ${coverHtml(workspace)}

    <div class="meta">
      <p>目的地: ${escapeHtml(workspace.trip.destination)}</p>
      <p>日程: ${escapeHtml(workspace.trip.start_date || '-')} 〜 ${escapeHtml(workspace.trip.end_date || '-')}</p>
      <p>参加者: ${escapeHtml(workspace.members.map((member) => member.name).join(', '))}</p>
      <p>招待コード: ${escapeHtml(workspace.trip.code)}</p>
    </div>

    <h2>行程表</h2>
    ${itineraryByTemplate(theme, workspace.itineraryItems, memberNameById)}

    <h2>足袋navi しおり</h2>
    ${guideRows || '<p class="empty">しおりメモはまだありません。</p>'}
  `;

  openPrintableDocument({
    title: `${workspace.trip.name} 足袋naviしおり`,
    bodyHtml,
    theme,
  });
}

export function exportMemoriesPdf(workspace, memberNameById) {
  const theme = normalizeTheme(workspace.trip.theme);

  const memoriesHtml = workspace.memories
    .map((memory) => {
      const photosHtml = (memory.image_urls || [])
        .map((url) => `<img class="photo" src="${escapeHtml(url)}" alt="memory" />`)
        .join('');

      return `
        <div class="entry">
          <h3>${escapeHtml(memory.title)}</h3>
          <p class="meta">日付: ${escapeHtml(memory.date || '-')} / 投稿者: ${escapeHtml(memberNameById[memory.author_user_id] || '-')}</p>
          <p>${nlToBr(memory.content || '')}</p>
          ${photosHtml ? `<div class="photos">${photosHtml}</div>` : ''}
        </div>
      `;
    })
    .join('');

  const bodyHtml = `
    ${coverHtml(workspace)}

    <div class="meta">
      <p>目的地: ${escapeHtml(workspace.trip.destination)}</p>
      <p>作成日: ${escapeHtml(new Date().toLocaleDateString('ja-JP'))}</p>
    </div>

    <h2>思い出アルバム</h2>
    ${memoriesHtml || '<p class="empty">思い出はまだ登録されていません。</p>'}
  `;

  openPrintableDocument({
    title: `${workspace.trip.name} 思い出アルバム`,
    bodyHtml,
    theme,
  });
}
