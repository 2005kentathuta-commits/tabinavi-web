import { normalizeTheme } from './travelStore';

const PRINT_READY_TIMEOUT_MS = 25000;
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

function sectionAnchor(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
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

function normalizeTemplateToken(value) {
  const raw = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '');
  return raw || 'templatea';
}

function templatePrintCss(templateId) {
  if (templateId === 'templateb') {
    return `
      @page {
        margin: 10mm;
      }

      body.pdf-template-templateb {
        font-size: 12.2px;
        line-height: 1.58;
      }

      body.pdf-template-templateb .cover-page {
        border-radius: 18px;
      }

      body.pdf-template-templateb .doc-section {
        margin-top: 8px;
      }

      body.pdf-template-templateb .doc-section.section-itinerary,
      body.pdf-template-templateb .doc-section.section-packing,
      body.pdf-template-templateb .doc-section.section-members,
      body.pdf-template-templateb .doc-section.section-album,
      body.pdf-template-templateb .doc-section.section-guestbook {
        break-before: page;
        page-break-before: always;
      }

      body.pdf-template-templateb .day-flow {
        background: #fffaf1;
      }

      body.pdf-template-templateb .day-flow-head {
        border-bottom-style: solid;
      }

      body.pdf-template-templateb .flow-card {
        background: #fffef9;
        border-color: #d9c5ad;
      }

      body.pdf-template-templateb .packing-item {
        border-left-color: var(--primary);
      }

      body.pdf-template-templateb .album-mosaic {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      body.pdf-template-templateb .album-card {
        break-inside: avoid;
        page-break-inside: avoid;
      }

      body.pdf-template-templateb .guestbook-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    `;
  }

  return `
    @page {
      margin: 12mm;
    }

    body.pdf-template-templatea {
      font-size: 13px;
      line-height: 1.62;
    }

    body.pdf-template-templatea .cover-page {
      border-radius: 20px;
    }

    body.pdf-template-templatea .doc-section {
      margin-top: 12px;
    }

    body.pdf-template-templatea .doc-section.section-itinerary,
    body.pdf-template-templatea .doc-section.section-packing,
    body.pdf-template-templatea .doc-section.section-members,
    body.pdf-template-templatea .doc-section.section-album,
    body.pdf-template-templatea .doc-section.section-guestbook {
      break-before: page;
      page-break-before: always;
    }

    body.pdf-template-templatea .day-flow {
      background: #ffffff;
    }

    body.pdf-template-templatea .flow-card {
      background: #fffdfb;
      border-color: #e6d6c7;
    }

    body.pdf-template-templatea .album-mosaic {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    body.pdf-template-templatea .album-card,
    body.pdf-template-templatea .guest-note {
      break-inside: avoid;
      page-break-inside: avoid;
    }
  `;
}

function printableHtml({ title, bodyHtml, theme }) {
  const fontFamily = fontCss(theme);
  const templateToken = normalizeTemplateToken(theme?.uiTemplateId || 'templateA');
  const templateCss = templatePrintCss(templateToken);
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
            font-size: 13px;
            line-height: 1.6;
            margin: 0;
            overflow-wrap: anywhere;
            word-break: break-word;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          img {
            max-width: 100%;
            image-rendering: auto;
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
            overflow-wrap: anywhere;
          }

          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 8px;
            font-size: 12px;
            page-break-inside: auto;
          }

          thead {
            display: table-header-group;
          }

          tfoot {
            display: table-footer-group;
          }

          tr {
            break-inside: avoid;
            page-break-inside: avoid;
          }

          th,
          td {
            border: 1px solid #d1d5db;
            padding: 6px;
            vertical-align: top;
            overflow-wrap: anywhere;
          }

          th {
            background: #eef2ff;
            text-align: left;
          }

          .cover-page {
            position: relative;
            min-height: 268mm;
            border: 1px solid rgba(99, 87, 77, 0.2);
            overflow: hidden;
            background: #fffdf8;
            break-after: page;
            page-break-after: always;
            break-inside: avoid;
            page-break-inside: avoid;
          }

          .cover-visual {
            position: absolute;
            inset: 0;
            min-height: 268mm;
            background: linear-gradient(128deg, var(--primary), var(--accent));
          }

          .cover-image {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            object-fit: cover;
            object-position: center center;
            display: block;
          }

          .cover-fallback {
            position: absolute;
            inset: 0;
            background:
              radial-gradient(circle at 18% 24%, rgba(255, 255, 255, 0.55), transparent 36%),
              radial-gradient(circle at 88% 18%, rgba(255, 255, 255, 0.42), transparent 34%),
              linear-gradient(132deg, var(--primary), var(--accent));
          }

          .cover-body {
            position: absolute;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 2;
            padding: 24px 24px 28px;
            display: grid;
            gap: 8px;
            background: linear-gradient(180deg, rgba(9, 7, 6, 0), rgba(15, 10, 7, 0.86));
          }

          .stamp {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: fit-content;
            border: 1.5px solid rgba(255, 247, 233, 0.9);
            color: #fff8ea;
            border-radius: 999px;
            padding: 4px 12px;
            margin: 0;
            font-weight: 700;
            letter-spacing: 0.06em;
            font-size: 11px;
            background: rgba(17, 11, 8, 0.35);
          }

          .cover-title {
            margin: 4px 0 0;
            font-size: 34px;
            line-height: 1.22;
            color: #fffaf2;
            text-shadow: 0 1px 2px rgba(0, 0, 0, 0.36);
          }

          .cover-subtitle {
            margin: 0;
            font-size: 14px;
            color: rgba(255, 246, 233, 0.95);
          }

          .cover-meta {
            display: grid;
            gap: 4px;
            margin-top: 8px;
            font-size: 11px;
            color: rgba(255, 242, 224, 0.92);
          }

          .doc-section {
            margin-top: 12px;
            break-inside: auto;
            page-break-inside: auto;
          }

          .doc-section.page-break-before {
            break-before: page;
          }

          .section-head {
            display: flex;
            justify-content: space-between;
            align-items: baseline;
            gap: 8px;
            margin: 0 0 10px;
            break-after: avoid;
            page-break-after: avoid;
          }

          .section-head h2 {
            margin: 0;
            border-bottom: none;
            padding-bottom: 0;
            letter-spacing: 0.03em;
          }

          .section-count {
            font-size: 11px;
            color: #685647;
          }

          .mini-list {
            display: grid;
            gap: 8px;
          }

          .mini-item {
            border-left: 3px solid var(--accent);
            padding: 8px 10px;
            background: #fffaf3;
            border-radius: 10px;
            break-inside: avoid;
          }

          .mini-item h4 {
            margin: 0;
            font-size: 13px;
          }

          .mini-item p {
            margin: 4px 0 0;
            font-size: 11px;
            color: #54483f;
          }

          .packing-list {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 8px;
          }

          .packing-item {
            border-left: 4px solid var(--accent);
            border-radius: 10px;
            background: #fff8ef;
            padding: 10px 12px;
            font-weight: 600;
            color: #2f241b;
            break-inside: avoid;
            page-break-inside: avoid;
          }

          .day-flow-list {
            display: grid;
            gap: 14px;
          }

          .day-flow {
            border: 1px solid rgba(125, 99, 77, 0.26);
            border-radius: 14px;
            padding: 12px;
            break-inside: avoid;
            page-break-inside: avoid;
          }

          .day-flow-head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            margin-bottom: 10px;
            border-bottom: 1px dashed rgba(104, 86, 71, 0.36);
            padding-bottom: 8px;
          }

          .day-badge {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border-radius: 999px;
            border: 1px solid #2f241b;
            padding: 3px 10px;
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.08em;
            background: #fff;
          }

          .day-date {
            font-size: 12px;
            font-weight: 700;
            color: #423428;
          }

          .flow-entry-list {
            display: grid;
            gap: 4px;
          }

          .flow-item {
            display: grid;
            grid-template-columns: 74px minmax(0, 1fr);
            gap: 10px;
            align-items: start;
          }

          .flow-time {
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.02em;
            border-radius: 8px;
            border: 1px solid var(--primary);
            background: rgba(255, 255, 255, 0.88);
            color: #2f241b;
            text-align: center;
            padding: 4px 6px;
          }

          .flow-card {
            border: 1px solid #e5ddd2;
            border-radius: 10px;
            padding: 8px 10px;
            min-width: 0;
          }

          .flow-title {
            margin: 0;
            font-size: 13px;
            font-weight: 700;
            color: #1f1712;
          }

          .flow-place {
            margin: 2px 0 0;
            font-size: 11px;
            color: #57493d;
          }

          .flow-link {
            margin: 4px 0 0;
            font-size: 10px;
            color: #1a5ca2;
            word-break: break-all;
          }

          .flow-note {
            margin: 4px 0 0;
            font-size: 11px;
            color: #3c3128;
            white-space: pre-wrap;
          }

          .flow-arrow {
            margin: 0 0 0 84px;
            color: var(--accent);
            font-size: 14px;
            line-height: 1;
            font-weight: 700;
          }

          .album-day-list {
            display: grid;
            gap: 14px;
          }

          .album-day-section {
            break-inside: avoid;
            page-break-inside: avoid;
          }

          .album-day-head {
            display: flex;
            justify-content: space-between;
            align-items: baseline;
            gap: 8px;
            margin: 0 0 8px;
            border-bottom: 1px dashed rgba(104, 86, 71, 0.35);
            padding-bottom: 6px;
          }

          .album-day-head h3 {
            margin: 0;
            font-size: 15px;
          }

          .album-day-head span {
            font-size: 11px;
            color: #5d4f43;
          }

          .album-mosaic {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 10px;
          }

          .album-card {
            border: 1px solid #d8cbbc;
            border-radius: 12px;
            overflow: hidden;
            background: #fffdfb;
            break-inside: avoid;
            page-break-inside: avoid;
          }

          .album-photo {
            width: 100%;
            height: 148px;
            object-fit: cover;
            display: block;
          }

          .album-photo-fallback {
            height: 148px;
            background:
              linear-gradient(140deg, var(--primary), var(--accent));
          }

          .album-body {
            padding: 8px 10px;
            min-width: 0;
          }

          .album-meta {
            display: flex;
            gap: 6px;
            flex-wrap: wrap;
          }

          .album-meta span {
            font-size: 10px;
            border: 1px solid #d3c9be;
            border-radius: 999px;
            padding: 2px 7px;
            color: #54493f;
          }

          .album-title {
            margin: 6px 0 2px;
            font-size: 13px;
            color: #201813;
          }

          .album-caption {
            margin: 0;
            font-size: 11px;
            color: #4f4338;
            white-space: pre-wrap;
          }

          .guestbook-grid {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 10px;
          }

          .guest-note {
            border: 1px solid rgba(78, 62, 48, 0.24);
            border-radius: 12px;
            padding: 12px;
            background: color-mix(in srgb, var(--note-color, #fff6ea) 75%, #ffffff 25%);
            transform: rotate(var(--note-tilt, 0deg));
            break-inside: avoid;
            page-break-inside: avoid;
          }

          .guest-note-head {
            display: flex;
            justify-content: space-between;
            align-items: baseline;
            gap: 8px;
            margin-bottom: 6px;
          }

          .guest-note-title {
            font-size: 12px;
            font-weight: 700;
            color: #2d231b;
          }

          .guest-note-author {
            font-size: 10px;
            color: #5b4c40;
          }

          .guest-note p {
            margin: 0;
            font-size: 11px;
            color: #3d3026;
            white-space: pre-wrap;
          }

          .empty {
            border: 1px dashed #cfbda8;
            border-radius: 10px;
            padding: 12px;
            color: #66584b;
            background: #fffaf3;
          }

          ${templateCss}

          @media print {
            a {
              color: inherit;
              text-decoration: none;
            }

            h1,
            h2,
            h3 {
              break-after: avoid;
              page-break-after: avoid;
            }

            .doc-section,
            .cover-page,
            .mini-item,
            .packing-item,
            .day-flow,
            .flow-item,
            .flow-card,
            .album-card,
            .album-day-section,
            .guest-note {
              break-inside: avoid;
              page-break-inside: avoid;
            }

            .cover-image,
            .album-photo {
              break-inside: avoid;
              page-break-inside: avoid;
            }
          }
        </style>
      </head>
      <body class="pdf-template-${escapeHtml(templateToken)}">
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
      if (typeof popup.print !== 'function') {
        popup.focus();
        return;
      }
      try {
        popup.focus();
        popup.print();
      } catch {
        popup.focus();
        return;
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

      if (typeof win.print !== 'function') {
        cleanup();
        fallbackPopupPrint(html, title).then(resolve).catch(reject);
        return;
      }

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

function resolveAssetUrl(rawUrl, rawPath = '') {
  const first = String(rawUrl || '').trim();
  if (first.startsWith('data:')) {
    return first;
  }
  if (/^https?:\/\//i.test(first)) {
    return first;
  }

  const second = String(rawPath || '').trim();
  const candidate = first || second;
  if (!candidate) {
    return '';
  }

  if (/^https?:\/\//i.test(candidate) || candidate.startsWith('data:')) {
    return candidate;
  }

  const origin =
    typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'https://localhost';
  if (candidate.startsWith('/')) {
    return `${origin}${candidate}`;
  }
  return `${origin}/${candidate}`;
}

function renderImageOrFallback({ imageUrl, altText, imageClass, fallbackClass }) {
  if (!imageUrl) {
    return `<div class="${escapeHtml(fallbackClass)}"></div>`;
  }

  return `
    <img
      class="${escapeHtml(imageClass)}"
      src="${escapeHtml(imageUrl)}"
      alt="${escapeHtml(altText || '')}"
      loading="eager"
      decoding="sync"
      onerror="this.style.display='none'; if(this.nextElementSibling){ this.nextElementSibling.style.display='block'; }"
    />
    <div class="${escapeHtml(fallbackClass)}" style="display:none;"></div>
  `;
}

function coverHtml(workspace) {
  const theme = normalizeTheme(workspace.trip.theme);
  const coverImageUrl = resolveAssetUrl(workspace.trip.cover_image_url, workspace.trip.cover_image_path);
  const travelerNames = (workspace.members || [])
    .map((member) => String(member.name || '').trim())
    .filter(Boolean);

  return `
    <section class="cover-page">
      <div class="cover-visual">
        ${renderImageOrFallback({
          imageUrl: coverImageUrl,
          altText: 'cover',
          imageClass: 'cover-image',
          fallbackClass: 'cover-fallback',
        })}
      </div>
      <div class="cover-body">
        <p class="stamp">${escapeHtml(theme.stampText || '足袋navi')}</p>
        <h1 class="cover-title">${escapeHtml(workspace.trip.cover_title || workspace.trip.name || '旅のしおり')}</h1>
        <p class="cover-subtitle">${escapeHtml(workspace.trip.cover_subtitle || workspace.trip.destination || '')}</p>
        <div class="cover-meta">
          <span>日程: ${escapeHtml(workspace.trip.start_date || '-')} 〜 ${escapeHtml(workspace.trip.end_date || '-')}</span>
          <span>目的地: ${escapeHtml(workspace.trip.destination || '-')}</span>
          <span>参加者: ${escapeHtml(travelerNames.join(' / ') || '-')}</span>
          <span>招待コード: ${escapeHtml(workspace.trip.code || '-')}</span>
        </div>
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
    dayLabel: date === '日付未設定' ? 'FREE' : `Day${index + 1}`,
    date,
    items: dayItems,
  }));
}

function formatTimeLabel(item) {
  const start = String(item?.start_time || '').trim();
  const end = String(item?.end_time || '').trim();
  if (start && end) {
    return `${start} - ${end}`;
  }
  if (start) {
    return start;
  }
  if (end) {
    return `--:-- - ${end}`;
  }
  return '--:--';
}

function itineraryFlowHtml(items) {
  const days = groupItineraryByDay(items);
  if (days.length === 0) {
    return '<div class="empty">予定はまだありません。</div>';
  }

  return `
    <div class="day-flow-list">
      ${days
        .map(
          (day) => `
        <section class="day-flow">
          <div class="day-flow-head">
            <span class="day-badge">${escapeHtml(day.dayLabel)}</span>
            <strong class="day-date">${escapeHtml(day.date)}</strong>
          </div>
          <div class="flow-entry-list">
            ${day.items
              .map((item, index) => {
                const eventBlock = `
                  <article class="flow-item">
                    <div class="flow-time">${escapeHtml(formatTimeLabel(item))}</div>
                    <div class="flow-card">
                      <p class="flow-title">${escapeHtml(item.icon || '📍')} ${escapeHtml(item.title || '無題')}</p>
                      ${item.place ? `<p class="flow-place">${escapeHtml(item.place)}</p>` : ''}
                      ${
                        item.link_url
                          ? `<p class="flow-link"><a href="${escapeHtml(item.link_url)}" target="_blank" rel="noreferrer">${escapeHtml(item.link_url)}</a></p>`
                          : ''
                      }
                      ${item.notes ? `<p class="flow-note">${nlToBr(item.notes)}</p>` : ''}
                    </div>
                  </article>
                `;
                const arrow = index < day.items.length - 1 ? '<div class="flow-arrow">↓</div>' : '';
                return `${eventBlock}${arrow}`;
              })
              .join('')}
          </div>
        </section>
      `,
        )
        .join('')}
    </div>
  `;
}

function itineraryTimelineHtml(items) {
  return itineraryFlowHtml(items);
}

function itineraryPaperHtml(items) {
  return itineraryFlowHtml(items);
}

function itineraryByTemplate(theme, items) {
  const template = String(theme.pdfTemplate || 'timeline');
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
  const dedupe = new Set();
  for (const section of guideSections) {
    const title = String(section?.title || '');
    if (!title.includes('持ち物') && !title.toLowerCase().includes('check') && !title.toLowerCase().includes('packing')) {
      continue;
    }
    const lines = String(section?.content || '')
      .split('\n')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) =>
        entry
          .replace(/^[-*・]\s*/, '')
          .replace(/^\[[xX ]\]\s*/, '')
          .replace(/^☐\s*/, '')
          .trim(),
      )
      .filter(Boolean);
    for (const line of lines) {
      const key = line.toLowerCase();
      if (dedupe.has(key)) {
        continue;
      }
      dedupe.add(key);
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

function groupMemoriesByDay(memories = []) {
  const byDate = new Map();
  for (const memory of memories) {
    const key = String(memory?.date || '日付未設定');
    const list = byDate.get(key) || [];
    list.push(memory);
    byDate.set(key, list);
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => {
      const aKey = a === '日付未設定' ? '9999-99-99' : a;
      const bKey = b === '日付未設定' ? '9999-99-99' : b;
      return aKey.localeCompare(bKey);
    })
    .map(([date, rows], index) => ({
      key: date,
      label: date === '日付未設定' ? 'FREE' : `Day${index + 1}`,
      rows,
    }));
}

function memoriesAlbumHtml(memories, itineraryItems, memberNameById) {
  if (!memories.length) {
    return '<p class="empty">思い出はまだ登録されていません。</p>';
  }

  const daySections = groupMemoriesByDay(memories);
  return `
    <div class="album-day-list">
      ${daySections
        .map((day) => {
          const anchor = sectionAnchor(`memories-day-${day.key}`);
          return `
            <section class="album-day-section" id="${escapeHtml(anchor)}">
              <header class="album-day-head">
                <h3>${escapeHtml(day.label)} / ${escapeHtml(day.key)}</h3>
                <span>${day.rows.length}件</span>
              </header>
              <div class="album-mosaic">
                ${day.rows
                  .map((memory) => {
                    const imageUrls = Array.isArray(memory.image_urls) ? memory.image_urls : [];
                    const leadImage = resolveAssetUrl(imageUrls[0] || '');
                    const place = memoryPlaceHint(memory, itineraryItems);
                    const leadCaption =
                      (Array.isArray(memory.image_captions) ? memory.image_captions[0] : '') ||
                      memory.content ||
                      '';
                    return `
                      <article class="album-card">
                        ${
                          renderImageOrFallback({
                            imageUrl: leadImage,
                            altText: 'memory',
                            imageClass: 'album-photo',
                            fallbackClass: 'album-photo-fallback',
                          })
                        }
                        <div class="album-body">
                          <div class="album-meta">
                            <span>${escapeHtml(memory.date || '-')}</span>
                            ${place ? `<span>${escapeHtml(place)}</span>` : ''}
                            <span>${escapeHtml(memberNameById[memory.author_user_id] || '-')}</span>
                          </div>
                          <h3 class="album-title">${escapeHtml(memory.title || '無題')}</h3>
                          ${leadCaption ? `<p class="album-caption">${nlToBr(leadCaption)}</p>` : ''}
                        </div>
                      </article>
                    `;
                  })
                  .join('')}
              </div>
            </section>
          `;
        })
        .join('')}
    </div>
  `;
}

function memoriesGuestbookHtml(memories, memberNameById) {
  if (!memories.length) {
    return '<p class="empty">寄せ書きに使える思い出がまだありません。</p>';
  }

  const palette = ['#fff1d7', '#ffe8e3', '#ecf7ff', '#eef8ec', '#f4ecff', '#fff6e8'];

  return `
    <div class="guestbook-grid">
      ${memories
        .map((memory, index) => {
          const tilt = ((index % 5) - 2) * 0.9;
          const noteColor = palette[index % palette.length];
          const author = memberNameById[memory.author_user_id] || 'Traveler';
          const text = String(memory.content || memory.title || 'またこの場所へ来たい。').trim();

          return `
            <article class="guest-note" style="--note-tilt:${tilt}deg; --note-color:${noteColor};">
              <div class="guest-note-head">
                <span class="guest-note-title">${escapeHtml(memory.title || 'ひとこと')}</span>
                <span class="guest-note-author">${escapeHtml(author)}</span>
              </div>
              <p>${nlToBr(text)}</p>
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
      <article class="packing-item">
        ${escapeHtml(entry)}
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

  const sectionBlocks = [];
  sectionBlocks.push(`
    <section class="doc-section section-itinerary" id="${sectionAnchor('guide-itinerary')}">
      ${sectionHeadHtml('旅程', `${(workspace.itineraryItems || []).length}件`)}
      ${itineraryByTemplate(theme, workspace.itineraryItems)}
    </section>
  `);

  sectionBlocks.push(`
    <section class="doc-section section-packing" id="${sectionAnchor('guide-packing')}">
      ${sectionHeadHtml('持ち物', `${packingItems.length}件`)}
      ${packingRows ? `<div class="packing-list">${packingRows}</div>` : '<p class="empty">持ち物はまだ入力されていません。</p>'}
    </section>
  `);

  if (reservations.length > 0) {
    sectionBlocks.push(`
      <section class="doc-section section-reservations" id="${sectionAnchor('guide-reservations')}">
        ${sectionHeadHtml('予約', `${reservations.length}件`)}
        <div class="mini-list">${reservationRows}</div>
      </section>
    `);
  }

  if (members.length > 0) {
    sectionBlocks.push(`
      <section class="doc-section section-members" id="${sectionAnchor('guide-members')}">
        ${sectionHeadHtml('メンバー', `${members.length}名`)}
        <div class="mini-list">${memberRows}</div>
      </section>
    `);
  }

  const bodyHtml = `
    ${coverHtml(workspace)}
    ${sectionBlocks.join('')}
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

  const bodyHtml = `
    ${coverHtml(workspace)}

    <section class="doc-section section-album" id="${sectionAnchor('memories-album')}">
      ${sectionHeadHtml('思い出アルバム', `${memories.length}件`)}
      ${memoriesAlbumHtml(memories, workspace.itineraryItems || [], memberNameById)}
    </section>

    <section class="doc-section section-guestbook" id="${sectionAnchor('memories-guestbook')}">
      ${sectionHeadHtml('みんなの寄せ書き', `${memories.length}件`)}
      ${memoriesGuestbookHtml(memories, memberNameById)}
    </section>
  `;

  return openPrintableDocument({
    title: `${workspace.trip.name} 思い出アルバム`,
    bodyHtml,
    theme,
  });
}
