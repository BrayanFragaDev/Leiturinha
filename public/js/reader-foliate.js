// Leitor de ePub, MOBI, AZW3, FB2 e CBZ sobre o foliate-js. Implementa a interface Reader
// (veja reader-pdf.js): meta(), toc(), goTo(loc), goToFraction(f), next(), prev(), search(q),
// setTheme(t), setFontSize(px), setZoom(z), onRelocate(cb), destroy().
// openFoliateReader não navega sozinho: as telas registram onRelocate e chamam goTo(local ou null).

import '../vendor/foliate-js/view.js';
import { formatPercent } from './format.js';
import { hasDrm, drmError } from './drm.js';

// Valores literais: o conteúdo do livro fica num iframe e não herda as variáveis CSS do app.
const THEMES = {
  claro: { fundo: '#ffffff', texto: '#1d1d1f' },
  sepia: { fundo: '#f4ecd8', texto: '#5b4636' },
  escuro: { fundo: '#121212', texto: '#e6e6e6' },
};
const DEFAULT_FONT = 18;

function buildCss(theme, fontSize) {
  const { fundo, texto } = THEMES[theme] || THEMES.claro;
  return `
    html { background: ${fundo} !important; color: ${texto} !important; font-size: ${fontSize}px !important; }
    body { background: transparent !important; color: ${texto} !important; font-size: ${fontSize}px !important; }
    p, li, blockquote, dd, dt, td, th, div, span { color: ${texto} !important; }
    p, li, blockquote, dd, dt, td, th { font-size: ${fontSize}px !important; }
    a:any-link { color: ${texto} !important; }
  `;
}

// title/author podem ser string, objeto ({pt: '...'}, {name: ...}) ou lista.
function normalizeName(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) {
    return value.map(normalizeName).filter(Boolean).join(', ');
  }
  if (typeof value === 'object') {
    if ('name' in value) return normalizeName(value.name);
    return Object.values(value).map(normalizeName).filter(Boolean).join(', ');
  }
  return '';
}

function excerptOf(excerpt) {
  if (typeof excerpt === 'string') return excerpt.replace(/\s+/g, ' ').trim();
  const { pre = '', match = '', post = '' } = excerpt || {};
  return `${pre}${match}${post}`.replace(/\s+/g, ' ').trim();
}

function tocOf(items) {
  return (items || []).map((item) => ({
    label: normalizeName(item.label),
    // o href vale para goTo (resolvido por book.resolveHref)
    location: typeof item.href === 'string' ? item.href : '',
    children: tocOf(item.subitems),
  }));
}

// O foliate não recusa livros com DRM: no ePub um algoritmo desconhecido só gera aviso e no
// MOBI o campo encryption é ignorado. Lê o que a regra de drm.js precisa.
async function isProtected(book) {
  const palmdoc = book?.mobi?.headers?.palmdoc; // MOBI6 e KF8 guardam o MOBI em book.mobi
  if (palmdoc) return hasDrm({ mobiEncryption: palmdoc.encryption });
  if (typeof book?.loadText !== 'function') return false; // FB2, CBZ
  const [rightsXml, encryptionXml] = await Promise.all([
    book.loadText('META-INF/rights.xml'),
    book.loadText('META-INF/encryption.xml'),
  ]);
  return hasDrm({ rightsXml, encryptionXml });
}

/**
 * @param {HTMLElement} container
 * @param {Blob} blob
 */
export async function openFoliateReader(container, blob) {
  const file =
    blob instanceof File ? blob : new File([blob], blob.name || 'livro', { type: blob.type });

  container.replaceChildren();
  const view = document.createElement('foliate-view');
  view.style.cssText = 'display:block;width:100%;height:100%;';
  container.append(view);

  let destroyed = false;
  let theme = 'claro';
  let fontSize = DEFAULT_FONT;
  const listeners = [];
  const DESTROYED = Symbol('destroyed');
  let signalDestroyed;
  const whenDestroyed = new Promise((resolve) => (signalDestroyed = () => resolve(DESTROYED)));

  try {
    await view.open(file);
    if (await isProtected(view.book)) throw drmError();
  } catch (err) {
    try {
      view.book?.destroy?.();
    } catch {
      // nada a liberar
    }
    view.remove();
    throw err;
  }

  const { book } = view;
  const sectionCount = book.sections?.length ?? 0;

  // O paginator agenda um requestAnimationFrame a cada setStyles (inclusive os que ele mesmo
  // faz ao carregar uma seção) e esse callback usa o renderer; se o destroy() vier antes dele
  // rodar, lança TypeError. Todo setStyles passa por aqui, e o rAF agendado vira no-op depois
  // do destroy (a troca de requestAnimationFrame dura só a chamada síncrona).
  const renderer = view.renderer;
  if (renderer?.setStyles) {
    const original = renderer.setStyles.bind(renderer);
    renderer.setStyles = (styles) => {
      const raf = window.requestAnimationFrame;
      window.requestAnimationFrame = (cb) => raf.call(window, (t) => !destroyed && cb(t));
      try {
        original(styles);
      } finally {
        window.requestAnimationFrame = raf;
      }
    };
  }

  // O paginator guarda os estilos e os reaplica a cada seção carregada.
  function applyStyles() {
    if (destroyed) return;
    view.renderer?.setStyles?.(buildCss(theme, fontSize));
  }
  applyStyles();

  function onRelocate(event) {
    const { cfi, fraction } = event.detail;
    const payload = { location: cfi, fraction, label: formatPercent(fraction) };
    for (const cb of listeners) cb(payload);
  }
  view.addEventListener('relocate', onRelocate);

  // O foco pode ficar dentro do iframe do livro, de onde o teclado não sobe ao document.
  // Repassa as teclas como eventos sintéticos no foliate-view (que sobem ao document).
  function onSectionLoad(event) {
    const doc = event.detail?.doc;
    if (!doc) return;
    doc.addEventListener('keydown', (e) => {
      const copy = new KeyboardEvent('keydown', {
        key: e.key, code: e.code, ctrlKey: e.ctrlKey, altKey: e.altKey, metaKey: e.metaKey,
        shiftKey: e.shiftKey, bubbles: true, cancelable: true,
      });
      if (!view.dispatchEvent(copy) || copy.defaultPrevented) e.preventDefault();
    });
  }
  view.addEventListener('load', onSectionLoad);

  // Depois do destroy() o foliate não termina mais as navegações (o iframe sumiu) e, se o
  // renderer for chamado já destruído, ele cria uma visão órfã e lança num ResizeObserver.
  // Por isso: não chama o foliate se já foi destruído, e solta a chamada pendente ao destruir.
  async function guard(fn) {
    await null; // dá chance de um destroy() síncrono logo após a chamada
    if (destroyed) return undefined;
    const running = fn();
    running.catch(() => {}); // erro depois do destroy não vira rejeição solta
    try {
      const result = await Promise.race([running, whenDestroyed]);
      return result === DESTROYED ? undefined : result;
    } catch (err) {
      if (destroyed) return undefined;
      throw err;
    }
  }

  // CFI ou href -> destino do renderer, ou null se não der para resolver.
  async function resolve(target) {
    try {
      const resolved = await (/^epubcfi\(/.test(target)
        ? view.resolveCFI(target)
        : book.resolveHref(target));
      const index = resolved?.index;
      if (!Number.isInteger(index) || index < 0 || index >= sectionCount) return null;
      return resolved;
    } catch {
      return null;
    }
  }

  async function toFraction(f) {
    const x = Number.isFinite(f) ? Math.min(1, Math.max(0, f)) : 0;
    try {
      await view.goToFraction(x);
    } catch {
      // sem progresso por seção (ex.: CBZ): usa o índice da seção
      if (destroyed) return;
      await view.renderer.goTo({ index: Math.round(x * Math.max(0, sectionCount - 1)) });
    }
  }

  return {
    async meta() {
      const result = { cover: null };
      const metadata = book.metadata || {};
      const title = normalizeName(metadata.title);
      const author = normalizeName(metadata.author);
      if (title) result.title = title;
      if (author) result.author = author;
      try {
        const cover = await book.getCover?.();
        result.cover = cover instanceof Blob ? cover : null;
      } catch {
        result.cover = null;
      }
      return result;
    },

    async toc() {
      return tocOf(book.toc);
    },

    goTo(location) {
      return guard(async () => {
        const resolved = typeof location === 'string' && location ? await resolve(location) : null;
        if (resolved) {
          try {
            await view.renderer.goTo(resolved);
            return;
          } catch {
            if (destroyed) return;
          }
        }
        await toFraction(0);
      });
    },

    goToFraction(f) {
      return guard(() => toFraction(f));
    },

    next() {
      return guard(() => view.next());
    },

    prev() {
      return guard(() => view.prev());
    },

    async *search(query) {
      const text = String(query ?? '').trim();
      if (!text || destroyed) return;
      const iterator = view.search({ query: text });
      try {
        for (;;) {
          let step;
          try {
            step = await Promise.race([iterator.next(), whenDestroyed]);
          } catch (err) {
            if (destroyed) return;
            throw err;
          }
          if (destroyed || step === DESTROYED || step.done) return;
          const r = step.value;
          if (!r || typeof r !== 'object' || 'progress' in r) continue; // 'done' e progresso
          for (const item of r.subitems || (r.cfi ? [r] : [])) {
            if (destroyed) return;
            yield { location: item.cfi, excerpt: excerptOf(item.excerpt) };
          }
        }
      } finally {
        if (!destroyed) {
          try {
            view.clearSearch?.();
          } catch {
            // sem destaques para limpar
          }
        }
      }
    },

    setTheme(next) {
      theme = next in THEMES ? next : 'claro';
      applyStyles();
    },

    setFontSize(px) {
      if (typeof px === 'number' && Number.isFinite(px)) fontSize = px;
      applyStyles();
    },

    setZoom() {},

    onRelocate(cb) {
      listeners.push(cb);
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;
      signalDestroyed();
      view.removeEventListener('relocate', onRelocate);
      view.removeEventListener('load', onSectionLoad);
      listeners.length = 0;
      try {
        view.close();
      } catch {
        // já fechado
      }
      view.remove();
      try {
        book.destroy?.(); // revoga os object URLs do livro
      } catch {
        // nada a liberar
      }
    },
  };
}
