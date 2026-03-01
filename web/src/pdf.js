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

function openPrintableDocument({ title, bodyHtml, theme }) {
  const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=980,height=760');
  if (!printWindow) {
    throw new Error('ポップアップがブロックされました。ブラウザ設定で許可してください。');
  }

  const fontFamily = fontCss(theme);

  printWindow.document.write(`
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
            margin: 14mm;
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
        </style>
      </head>
      <body>
        ${bodyHtml}
        <script>
          window.onload = () => {
            window.print();
          };
        </script>
      </body>
    </html>
  `);

  printWindow.document.close();
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

export function exportGuidePdf(workspace, memberNameById) {
  const theme = normalizeTheme(workspace.trip.theme);

  const itineraryRows = workspace.itineraryItems
    .map(
      (item) => `
      <tr>
        <td>${escapeHtml(item.date || '-')}</td>
        <td>${escapeHtml(item.start_time || '-')} - ${escapeHtml(item.end_time || '-')}</td>
        <td>${escapeHtml(item.icon || '📍')} ${escapeHtml(item.title || '-')}</td>
        <td>${escapeHtml(item.place || '-')}</td>
        <td>${item.link_url ? `<a href="${escapeHtml(item.link_url)}" target="_blank" rel="noreferrer">${escapeHtml(item.link_url)}</a>` : '-'}</td>
        <td>${nlToBr(item.notes || '-')}</td>
        <td>${escapeHtml(memberNameById[item.owner_user_id] || '-')}</td>
      </tr>
    `,
    )
    .join('');

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
        ${itineraryRows || '<tr><td colspan="7">予定はまだありません。</td></tr>'}
      </tbody>
    </table>

    <h2>足袋navi しおり</h2>
    ${guideRows || '<p>しおりメモはまだありません。</p>'}
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
    ${memoriesHtml || '<p>思い出はまだ登録されていません。</p>'}
  `;

  openPrintableDocument({
    title: `${workspace.trip.name} 思い出アルバム`,
    bodyHtml,
    theme,
  });
}
