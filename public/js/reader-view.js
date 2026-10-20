// Tela de leitura: barra superior, painéis (sumário, busca, marcadores, aparência),
// barra de progresso, teclado e zonas de clique. Só fala com a interface Reader.
import { openPdfReader } from './reader-pdf.js';
import { openFoliateReader } from './reader-foliate.js';
import { loadPrefs, savePrefs, clampFont, TEMAS } from './prefs.js';
import { formatDate } from './format.js';
import { showToast } from './toast.js';

const SAVE_DELAY_MS = 1000;
const MAX_RESULTS = 200;
const ZOOM_STEP = 0.25;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const THEME_LABELS = { claro: 'Claro', sepia: 'Sépia', escuro: 'Escuro' };
const FILE_EXT = { fb2: '.fb2', cbz: '.cbz' };

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function iconButton(icon, text, label) {
  const btn = el('button', { type: 'button', className: 'leitor-btn' });
  btn.setAttribute('aria-label', label);
  btn.title = label;
  btn.append(el('span', { className: 'icone', textContent: icon, ariaHidden: 'true' }));
  btn.append(el('span', { className: 'rotulo', textContent: text }));
  return btn;
}

// Um blob sem nome perde a extensão, da qual o foliate depende.
function asNamedFile(blob, book) {
  if (blob instanceof File && blob.name) return blob;
  const ext = FILE_EXT[book.format] ?? `.${book.format}`;
  return new File([blob], `${book.title}${ext}`, { type: blob.type });
}

// Texto do livro entra só como nó de texto; o termo achado vai num <mark>.
function highlightInto(node, text, query) {
  const at = text.toLowerCase().indexOf(query.toLowerCase());
  if (at < 0 || !query) {
    node.append(text);
    return;
  }
  node.append(text.slice(0, at), el('mark', { textContent: text.slice(at, at + query.length) }), text.slice(at + query.length));
}

/**
 * @param {HTMLElement} root
 * @param {{library: object, id: string, onClose: () => void, signal?: AbortSignal}} options
 * @returns {Promise<{destroy(): void}>}
 */
export async function mountReaderView(root, { library, id, onClose, signal }) {
  let destroyed = false;
  let reader = null;
  let wrapper = null;
  const cleanups = [];

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    for (const fn of cleanups.splice(0)) {
      try { fn(); } catch { /* já liberado */ }
    }
    try { reader?.destroy(); } catch { /* já liberado */ }
    wrapper?.remove();
  }
  const handle = { destroy };
  signal?.addEventListener('abort', destroy, { once: true });
  const cancelled = () => destroyed || signal?.aborted === true;

  let book;
  try {
    book = await library.get(id);
  } catch {
    if (!cancelled()) {
      showToast('Livro não encontrado.');
      onClose();
    }
    return handle;
  }
  if (cancelled()) return handle;

  // --- estrutura ---
  const title = el('h1', { className: 'leitor-titulo', textContent: book.title });
  title.title = book.title;
  const backBtn = iconButton('←', 'Biblioteca', 'Voltar à biblioteca');
  const tocBtn = iconButton('☰', 'Sumário', 'Sumário');
  const searchBtn = iconButton('⌕', 'Buscar', 'Buscar');
  const markBtn = iconButton('⚑', 'Marcadores', 'Marcadores');
  const lookBtn = iconButton('Aa', 'Aparência', 'Aparência');
  const fullBtn = iconButton('⛶', 'Tela cheia', 'Tela cheia');
  const topbar = el('header', { className: 'leitor-topo' }, backBtn, title, tocBtn, searchBtn, markBtn, lookBtn, fullBtn);

  const area = el('div', { className: 'leitor-area' });
  const zonePrev = el('div', { className: 'leitor-zona leitor-zona-esq' });
  const zoneNext = el('div', { className: 'leitor-zona leitor-zona-dir' });
  zonePrev.setAttribute('aria-hidden', 'true');
  zoneNext.setAttribute('aria-hidden', 'true');
  const panel = el('aside', { className: 'leitor-painel', hidden: true });
  const body = el('div', { className: 'leitor-corpo' }, area, zonePrev, zoneNext, panel);

  const progressLabel = el('span', { className: 'leitor-progresso-rotulo', textContent: '' });
  const slider = el('input', { type: 'range', min: 0, max: 100, step: 1, value: Math.round((book.fraction || 0) * 100) });
  slider.setAttribute('aria-label', 'Progresso de leitura');
  const footer = el('footer', { className: 'leitor-rodape' }, progressLabel, slider);

  wrapper = el('div', { className: 'leitor' }, topbar, body, footer);
  root.append(wrapper);

  // --- abrir o leitor ---
  try {
    const stored = await library.getFile(id);
    if (cancelled()) return handle;
    const blob = asNamedFile(stored, book);
    const opened = book.format === 'pdf' ? await openPdfReader(area, blob) : await openFoliateReader(area, blob);
    if (cancelled()) {
      opened.destroy();
      return handle;
    }
    reader = opened;
  } catch {
    if (!cancelled()) {
      showToast(`Não foi possível abrir ${book.title}`);
      destroy();
      onClose();
    }
    return handle;
  }

  const isPdf = book.format === 'pdf';
  const prefs = loadPrefs();
  let theme = prefs.tema;
  let font = prefs.fonte;
  let zoom = 'largura';
  let current = { location: book.location, fraction: book.fraction || 0, label: '' };

  // --- progresso ---
  let savedLocation = book.location;
  let savedFraction = book.fraction;
  let saveTimer = null;
  let dirty = false;

  function flush() {
    clearTimeout(saveTimer);
    saveTimer = null;
    if (!dirty) return;
    dirty = false;
    const { location, fraction } = current;
    if (typeof location !== 'string' || !location) return;
    if (location === savedLocation && fraction === savedFraction) return;
    savedLocation = location;
    savedFraction = fraction;
    library.saveProgress(id, { location, fraction }).catch(() => {});
  }

  reader.onRelocate((pos) => {
    if (destroyed) return;
    current = pos;
    progressLabel.textContent = pos.label ?? '';
    slider.value = String(Math.round((pos.fraction || 0) * 100));
    dirty = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, SAVE_DELAY_MS);
  });

  slider.addEventListener('change', () => {
    reader.goToFraction(Number(slider.value) / 100).catch(() => {});
  });

  const onPageHide = () => flush();
  window.addEventListener('pagehide', onPageHide);
  cleanups.push(() => window.removeEventListener('pagehide', onPageHide));
  cleanups.push(flush);

  // --- tema e fonte ---
  document.documentElement.dataset.tema = theme;
  reader.setTheme(theme);
  reader.setFontSize(font);

  // --- painéis (um por vez) ---
  const panels = {};
  let openPanel = null;

  function setPanel(name) {
    openPanel = name;
    for (const [key, p] of Object.entries(panels)) {
      p.button.setAttribute('aria-expanded', String(key === name));
    }
    panel.hidden = name === null;
    panel.replaceChildren();
    if (name) {
      panel.setAttribute('aria-label', panels[name].label);
      panels[name].render();
    }
  }

  function registerPanel(name, button, label, render) {
    button.setAttribute('aria-expanded', 'false');
    panels[name] = { button, label, render };
    button.addEventListener('click', () => setPanel(openPanel === name ? null : name));
  }

  // Sumário: ao navegar o painel fecha sempre (a leitura fica livre depois de escolher o capítulo).
  function tocList(items) {
    const ul = el('ul', { className: 'leitor-lista' });
    for (const item of items) {
      const li = el('li');
      const btn = el('button', { type: 'button', className: 'leitor-item', textContent: item.label || '(sem título)' });
      btn.addEventListener('click', () => {
        reader.goTo(item.location).catch(() => {});
        setPanel(null);
      });
      li.append(btn);
      if (item.children?.length) li.append(tocList(item.children));
      ul.append(li);
    }
    return ul;
  }

  registerPanel('toc', tocBtn, 'Sumário', () => {
    const box = el('div', {}, el('h2', { textContent: 'Sumário' }));
    const status = el('p', { textContent: 'Carregando...' });
    box.append(status);
    panel.append(box);
    reader.toc().then((items) => {
      if (destroyed || openPanel !== 'toc') return;
      if (items.length) status.replaceWith(tocList(items));
      else status.textContent = 'Este livro não tem sumário.';
    }).catch(() => {
      if (!destroyed && openPanel === 'toc') status.textContent = 'Este livro não tem sumário.';
    });
  });

  // Busca: cada envio abre uma nova geração; a anterior sai do for-await ao notar a troca.
  let searchGen = 0;
  let searchQuery = '';
  cleanups.push(() => { searchGen++; });

  async function runSearch(query, resultsEl, statusEl) {
    const gen = ++searchGen;
    resultsEl.replaceChildren();
    statusEl.textContent = 'Buscando...';
    let count = 0;
    try {
      for await (const hit of reader.search(query)) {
        if (gen !== searchGen || destroyed) return;
        const item = el('li');
        const btn = el('button', { type: 'button', className: 'leitor-item' });
        highlightInto(btn, hit.excerpt, query);
        btn.addEventListener('click', () => {
          reader.goTo(hit.location).catch(() => {});
          if (window.matchMedia('(max-width: 700px)').matches) setPanel(null);
        });
        item.append(btn);
        resultsEl.append(item);
        count++;
        if (count >= MAX_RESULTS) break;
      }
    } catch {
      if (gen !== searchGen || destroyed) return;
      statusEl.textContent = 'Não foi possível buscar neste livro.';
      return;
    }
    if (gen !== searchGen || destroyed) return;
    statusEl.textContent = count === 0 ? 'Nenhum resultado' : count >= MAX_RESULTS ? `Mostrando os primeiros ${MAX_RESULTS} resultados` : '';
  }

  registerPanel('search', searchBtn, 'Buscar', () => {
    const input = el('input', { type: 'search', placeholder: 'Buscar no livro', value: searchQuery });
    input.setAttribute('aria-label', 'Buscar no livro');
    const submit = el('button', { type: 'submit', textContent: 'Buscar' });
    const form = el('form', { className: 'leitor-busca' }, input, submit);
    const status = el('p', { className: 'leitor-status', role: 'status' });
    const results = el('ul', { className: 'leitor-lista' });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const q = input.value.trim();
      searchQuery = q;
      if (!q) {
        searchGen++;
        results.replaceChildren();
        status.textContent = '';
        return;
      }
      runSearch(q, results, status);
    });
    panel.append(el('h2', { textContent: 'Buscar' }), form, status, results);
    input.focus();
  });

  async function renderBookmarks(listEl) {
    let marks = [];
    try { marks = await library.listBookmarks(id); } catch { /* lista vazia */ }
    if (destroyed || openPanel !== 'marks') return;
    listEl.replaceChildren();
    if (!marks.length) {
      listEl.append(el('li', { className: 'leitor-status', textContent: 'Nenhum marcador.' }));
      return;
    }
    for (const m of marks) {
      const go = el('button', { type: 'button', className: 'leitor-item' }, el('span', { textContent: m.label || 'Marcador' }), el('small', { textContent: formatDate(m.createdAt) }));
      go.addEventListener('click', () => reader.goTo(m.location).catch(() => {}));
      const del = el('button', { type: 'button', textContent: 'Remover' });
      del.setAttribute('aria-label', `Remover marcador ${m.label || ''}`.trim());
      del.addEventListener('click', async () => {
        try { await library.removeBookmark(m.id); } catch { /* já removido */ }
        renderBookmarks(listEl);
      });
      listEl.append(el('li', { className: 'leitor-marcador' }, go, del));
    }
  }

  registerPanel('marks', markBtn, 'Marcadores', () => {
    const add = el('button', { type: 'button', className: 'botao-primario', textContent: 'Adicionar marcador aqui' });
    const list = el('ul', { className: 'leitor-lista' });
    add.addEventListener('click', async () => {
      if (typeof current.location !== 'string' || !current.location) return;
      try {
        await library.addBookmark(id, { location: current.location, label: current.label });
      } catch {
        showToast('Não foi possível salvar o marcador.');
        return;
      }
      renderBookmarks(list);
    });
    panel.append(el('h2', { textContent: 'Marcadores' }), add, list);
    renderBookmarks(list);
  });

  function applyTheme(next) {
    theme = next;
    document.documentElement.dataset.tema = next;
    reader.setTheme(next);
    savePrefs({ tema: theme, fonte: font });
  }

  function applyFont(next) {
    font = clampFont(next);
    reader.setFontSize(font);
    savePrefs({ tema: theme, fonte: font });
  }

  function applyZoom(next) {
    zoom = next;
    reader.setZoom(next);
  }

  function stepZoom(delta) {
    const from = zoom === 'largura' ? 1 : zoom;
    applyZoom(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round((from + delta) / ZOOM_STEP) * ZOOM_STEP)));
  }

  registerPanel('look', lookBtn, 'Aparência', () => {
    const themes = el('div', { className: 'leitor-grupo', role: 'group' });
    themes.setAttribute('aria-label', 'Tema');
    for (const t of TEMAS) {
      const b = el('button', { type: 'button', textContent: THEME_LABELS[t] });
      b.setAttribute('aria-pressed', String(t === theme));
      b.addEventListener('click', () => {
        applyTheme(t);
        for (const other of themes.children) other.setAttribute('aria-pressed', String(other === b));
      });
      themes.append(b);
    }
    panel.append(el('h2', { textContent: 'Aparência' }), themes);

    if (isPdf) {
      const fit = el('button', { type: 'button', textContent: 'Ajustar à largura' });
      const minus = el('button', { type: 'button', textContent: '−' });
      const plus = el('button', { type: 'button', textContent: '+' });
      minus.setAttribute('aria-label', 'Diminuir zoom');
      plus.setAttribute('aria-label', 'Aumentar zoom');
      fit.addEventListener('click', () => applyZoom('largura'));
      minus.addEventListener('click', () => stepZoom(-ZOOM_STEP));
      plus.addEventListener('click', () => stepZoom(ZOOM_STEP));
      const group = el('div', { className: 'leitor-grupo', role: 'group' }, fit, minus, plus);
      group.setAttribute('aria-label', 'Zoom');
      panel.append(group);
    } else {
      const smaller = el('button', { type: 'button', textContent: 'A−' });
      const bigger = el('button', { type: 'button', textContent: 'A+' });
      smaller.setAttribute('aria-label', 'Diminuir fonte');
      bigger.setAttribute('aria-label', 'Aumentar fonte');
      smaller.addEventListener('click', () => applyFont(font - 2));
      bigger.addEventListener('click', () => applyFont(font + 2));
      const group = el('div', { className: 'leitor-grupo', role: 'group' }, smaller, bigger);
      group.setAttribute('aria-label', 'Fonte');
      panel.append(group);
    }
  });

  // --- tela cheia ---
  fullBtn.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen?.().catch?.(() => {});
    else document.documentElement.requestFullscreen?.()?.catch?.(() => {});
  });

  // --- voltar ---
  function close() {
    flush();
    onClose();
  }
  backBtn.addEventListener('click', close);

  // --- navegação por zonas ---
  zonePrev.addEventListener('click', () => reader.prev().catch(() => {}));
  zoneNext.addEventListener('click', () => reader.next().catch(() => {}));
  // As zonas cobrem parte da página: repassa a roda do mouse para o leitor rolável (PDF).
  for (const zone of [zonePrev, zoneNext]) {
    zone.addEventListener('wheel', (e) => {
      const scroller = area.firstElementChild;
      if (scroller && scroller.scrollHeight > scroller.clientHeight) {
        scroller.scrollBy(0, e.deltaY);
        e.preventDefault();
      }
    }, { passive: false });
  }

  // --- teclado ---
  function onKeyDown(e) {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    const t = e.target;
    if (t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return;
    switch (e.key) {
      case 'ArrowLeft':
      case 'PageUp':
        reader.prev().catch(() => {});
        break;
      case 'ArrowRight':
      case 'PageDown':
        reader.next().catch(() => {});
        break;
      case ' ':
        e.preventDefault();
        reader.next().catch(() => {});
        break;
      case 'Escape':
        if (openPanel) setPanel(null);
        else close();
        break;
      default:
        return;
    }
  }
  document.addEventListener('keydown', onKeyDown);
  cleanups.push(() => document.removeEventListener('keydown', onKeyDown));

  // Esc também fecha o painel quando o foco está no campo de busca (que não leva ao onKeyDown).
  const onPanelKey = (e) => {
    if (e.key === 'Escape' && openPanel) {
      e.stopPropagation();
      setPanel(null);
    }
  };
  panel.addEventListener('keydown', onPanelKey);

  // --- abrir na posição salva ---
  try { await library.markOpened(id); } catch { /* sem registro de abertura */ }
  if (cancelled()) return handle;
  try {
    await reader.goTo(book.location);
  } catch {
    // posição inválida: o leitor já cai no início
  }
  return handle;
}
