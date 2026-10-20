// Leitor de PDF sobre o pdf.js. Implementa a interface Reader:
//   meta(), toc(), goTo(loc), goToFraction(f), next(), prev(), search(q),
//   setTheme(t), setFontSize(px), setZoom(z), onRelocate(cb), destroy()
// Mostra uma página por vez em <canvas>, com a camada de texto para seleção.
// A renderização começa no primeiro goTo(); openPdfReader não exibe nada sozinho.

import * as pdfjs from '../vendor/pdfjs/build/pdf.min.mjs';
import { toPdfLocation, parsePdfLocation } from './locations.js';

const { getDocument, GlobalWorkerOptions, TextLayer } = pdfjs;

GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/build/pdf.worker.min.mjs', import.meta.url).href;
const CMAP_URL = new URL('../vendor/pdfjs/cmaps/', import.meta.url).href;
const FONTS_URL = new URL('../vendor/pdfjs/standard_fonts/', import.meta.url).href;

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const COVER_WIDTH = 300;
const EXCERPT_RADIUS = 40;

const THEME_FILTERS = {
  claro: '',
  sepia: 'sepia(0.3)',
  escuro: 'invert(0.9) hue-rotate(180deg)',
};

// Minúsculas e sem acentos, mantendo o índice de cada caractere no texto original.
function normalizeWithMap(text) {
  let norm = '';
  const map = [];
  for (let i = 0; i < text.length; i++) {
    const piece = text[i].normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    for (const ch of piece) {
      norm += ch;
      map.push(i);
    }
  }
  return { norm, map };
}

/**
 * @param {HTMLElement} container
 * @param {Blob} blob
 */
export async function openPdfReader(container, blob) {
  const data = new Uint8Array(await blob.arrayBuffer());
  const doc = await getDocument({
    data,
    cMapUrl: CMAP_URL,
    cMapPacked: true,
    standardFontDataUrl: FONTS_URL,
  }).promise;
  const numPages = doc.numPages;

  container.replaceChildren();
  const root = document.createElement('div');
  root.className = 'pdf-reader';
  const pageEl = document.createElement('div');
  pageEl.className = 'pdf-page';
  root.append(pageEl);
  container.append(root);

  let current = 0; // 0 = nada exibido ainda
  let zoom = 'largura';
  let theme = 'claro';
  let generation = 0;
  let renderTask = null;
  let textLayer = null;
  let destroyed = false;
  let lastWidth = root.clientWidth;
  const listeners = [];
  const DESTROYED = Symbol('destroyed');
  let signalDestroyed;
  // Resolve ao destruir: promessas pendentes do pdf.js nunca terminam depois do doc.destroy().
  const whenDestroyed = new Promise((resolve) => (signalDestroyed = () => resolve(DESTROYED)));

  function fractionOf(n) {
    return numPages === 1 ? 1 : (n - 1) / (numPages - 1);
  }

  async function render() {
    const gen = ++generation;
    renderTask?.cancel();
    textLayer?.cancel();
    const pageNumber = current;

    let page;
    try {
      page = await doc.getPage(pageNumber);
    } catch (err) {
      if (destroyed || gen !== generation) return;
      throw err;
    }
    if (gen !== generation) return;

    const base = page.getViewport({ scale: 1 });
    const scale =
      zoom === 'largura' ? Math.max(0.1, root.clientWidth / base.width) : zoom;
    const viewport = page.getViewport({ scale });
    const dpr = window.devicePixelRatio || 1;

    // Cada renderização usa um canvas novo, trocado só quando termina.
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width * dpr);
    canvas.height = Math.floor(viewport.height * dpr);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;
    canvas.style.filter = THEME_FILTERS[theme] || '';

    const textEl = document.createElement('div');
    textEl.className = 'pdf-text-layer';
    textEl.style.width = canvas.style.width;
    textEl.style.height = canvas.style.height;
    textEl.style.setProperty('--scale-factor', String(scale));

    const task = page.render({
      canvasContext: canvas.getContext('2d'),
      viewport,
      transform: dpr === 1 ? null : [dpr, 0, 0, dpr, 0, 0],
    });
    renderTask = task;
    try {
      await task.promise;
    } catch (err) {
      if (destroyed || gen !== generation || err?.name === 'RenderingCancelledException') return;
      throw err;
    }
    if (gen !== generation) return;

    const layer = new TextLayer({
      textContentSource: page.streamTextContent(),
      container: textEl,
      viewport,
    });
    textLayer = layer;
    try {
      await layer.render();
    } catch (err) {
      if (destroyed || gen !== generation || /cancel/i.test(String(err?.message || err))) return;
      throw err;
    }
    if (gen !== generation) return;

    canvas.style.filter = THEME_FILTERS[theme]; // tema pode ter mudado durante o render
    pageEl.style.width = canvas.style.width;
    pageEl.style.height = canvas.style.height;
    pageEl.replaceChildren(canvas, textEl);
    root.scrollTop = 0;

    const payload = {
      location: toPdfLocation(pageNumber),
      fraction: fractionOf(pageNumber),
      label: `Página ${pageNumber} de ${numPages}`,
    };
    for (const cb of listeners) cb(payload);
  }

  async function showPage(n) {
    if (destroyed) return;
    current = Math.min(Math.max(1, n), numPages);
    await render();
  }

  const observer = new ResizeObserver(() => {
    const w = root.clientWidth;
    if (w === lastWidth) return;
    lastWidth = w;
    if (!destroyed && zoom === 'largura' && current) render().catch(() => {});
  });
  observer.observe(root);

  async function coverBlob() {
    try {
      const page = await doc.getPage(1);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: COVER_WIDTH / base.width });
      const canvas = document.createElement('canvas');
      canvas.width = COVER_WIDTH;
      canvas.height = Math.max(1, Math.round(viewport.height));
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      return await new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
    } catch {
      return null;
    }
  }

  async function pageOfDest(dest) {
    let explicit = dest;
    if (typeof dest === 'string') explicit = await doc.getDestination(dest);
    if (!Array.isArray(explicit) || explicit.length === 0) return null;
    const target = explicit[0];
    if (Number.isInteger(target)) return target + 1;
    if (target && typeof target === 'object') return (await doc.getPageIndex(target)) + 1;
    return null;
  }

  async function convertOutline(items) {
    const out = [];
    for (const item of items || []) {
      const children = await convertOutline(item.items);
      let page = null;
      try {
        page = await pageOfDest(item.dest);
      } catch {
        page = null;
      }
      if (page) out.push({ label: item.title, location: toPdfLocation(page), children });
      else out.push(...children); // sem destino: mantém os filhos resolvíveis
    }
    return out;
  }

  return {
    async meta() {
      const result = { cover: await coverBlob() };
      try {
        const { info } = await doc.getMetadata();
        const title = typeof info?.Title === 'string' ? info.Title.trim() : '';
        const author = typeof info?.Author === 'string' ? info.Author.trim() : '';
        if (title) result.title = title;
        if (author) result.author = author;
      } catch {
        // sem metadados
      }
      return result;
    },

    async toc() {
      try {
        return await convertOutline(await doc.getOutline());
      } catch {
        return [];
      }
    },

    goTo(location) {
      return showPage(parsePdfLocation(location, numPages));
    },

    goToFraction(f) {
      const x = Number.isFinite(f) ? Math.min(1, Math.max(0, f)) : 0;
      return showPage(1 + Math.round(x * (numPages - 1)));
    },

    async next() {
      if (current < numPages) await showPage(current + 1);
    },

    async prev() {
      if (current > 1) await showPage(current - 1);
    },

    async *search(query) {
      const needle = normalizeWithMap(String(query ?? '').trim()).norm;
      if (!needle) return;
      for (let n = 1; n <= numPages && !destroyed; n++) {
        let content;
        try {
          content = await Promise.race([
            doc.getPage(n).then((page) => page.getTextContent()),
            whenDestroyed,
          ]);
        } catch (err) {
          if (destroyed) return;
          throw err;
        }
        if (destroyed || content === DESTROYED) return;
        let text = '';
        for (const item of content.items) {
          text += item.str;
          if (item.hasEOL) text += ' ';
        }
        const { norm, map } = normalizeWithMap(text);
        let from = 0;
        for (;;) {
          const at = norm.indexOf(needle, from);
          if (at === -1) break;
          from = at + needle.length;
          const start = map[at];
          const end = map[from - 1] + 1;
          const excerpt = text
            .slice(Math.max(0, start - EXCERPT_RADIUS), end + EXCERPT_RADIUS)
            .replace(/\s+/g, ' ')
            .trim();
          yield { location: toPdfLocation(n), excerpt };
        }
      }
    },

    setTheme(next) {
      theme = next in THEME_FILTERS ? next : 'claro';
      const canvas = pageEl.querySelector('canvas');
      if (canvas) canvas.style.filter = THEME_FILTERS[theme];
    },

    setFontSize() {},

    setZoom(z) {
      if (z === 'largura') zoom = 'largura';
      else if (typeof z === 'number' && Number.isFinite(z)) zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
      else return;
      if (!destroyed && current) render().catch(() => {});
    },

    onRelocate(cb) {
      listeners.push(cb);
    },

    destroy() {
      destroyed = true;
      signalDestroyed();
      generation++;
      renderTask?.cancel();
      textLayer?.cancel();
      observer.disconnect();
      listeners.length = 0;
      container.replaceChildren();
      doc.destroy();
    },
  };
}

export { toPdfLocation, parsePdfLocation };
