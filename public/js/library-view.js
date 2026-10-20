// Tela da biblioteca: estante, busca, ordenação, importação e remoção.
import { ACCEPT } from './formats.js';
import { formatPercent, formatSize } from './format.js';
import { coverColor } from './cover-color.js';
import { LibraryError } from './library.js';
import { openPdfReader } from './reader-pdf.js';
import { openFoliateReader } from './reader-foliate.js';
import { showToast } from './toast.js';

const SORTS = [
  ['recentes', 'Lidos recentemente'],
  ['titulo', 'Título'],
  ['adicionados', 'Adicionados recentemente'],
];

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

// Lê título, autor e capa abrindo o livro num contêiner fora da tela.
async function extractMeta(file, format) {
  const box = el('div');
  box.style.cssText = 'position:fixed;left:-10000px;top:0;width:600px;height:800px;overflow:hidden';
  document.body.append(box);
  let reader;
  try {
    reader = format === 'pdf' ? await openPdfReader(box, file) : await openFoliateReader(box, file);
    return await reader.meta();
  } finally {
    try { reader?.destroy(); } catch { /* já liberado */ }
    box.remove();
  }
}

export function mountLibraryView(root, { library, store, onOpen }) {
  let sort = 'recentes';
  let query = '';
  let coverUrls = [];
  let debounce;
  let listSeq = 0;

  const fileInput = el('input', { type: 'file', multiple: true, accept: ACCEPT, hidden: true });
  const addBtn = el('button', { type: 'button', className: 'botao-primario' }, 'Adicionar livros');
  addBtn.addEventListener('click', () => fileInput.click());
  const search = el('input', {
    type: 'search', placeholder: 'Buscar por título ou autor', className: 'busca',
  });
  search.setAttribute('aria-label', 'Buscar por título ou autor');
  const select = el('select', { className: 'ordem' });
  select.setAttribute('aria-label', 'Ordenar por');
  for (const [value, label] of SORTS) select.append(el('option', { value }, label));

  const header = el('header', { className: 'bib-topo' },
    el('h1', {}, 'Biblioteca'), addBtn, search, select);
  const banner = el('p', { className: 'faixa-temporaria', hidden: store.persistent !== false },
    'Modo temporário: a biblioteca não será salva neste navegador.');
  const shelf = el('div', { className: 'estante' });
  const usage = el('footer', { className: 'bib-rodape' });
  root.replaceChildren(banner, header, fileInput, shelf, usage);

  async function refresh() {
    const seq = ++listSeq;
    const books = await library.list({ sort, query });
    let used = 0;
    try { used = (await store.usage()).usedBytes ?? 0; } catch { /* sem estimativa */ }
    if (seq !== listSeq) return;

    for (const url of coverUrls) URL.revokeObjectURL(url);
    coverUrls = [];
    if (!books.length) {
      shelf.replaceChildren(el('p', { className: 'estante-vazia' },
        query ? 'Nenhum livro encontrado.' : 'Arraste PDFs ou ebooks para cá ou use Adicionar livros.'));
    } else {
      shelf.replaceChildren(...books.map(card));
    }
    usage.textContent = `Espaço usado: ${formatSize(used)}`;
  }

  function card(book) {
    let cover;
    if (book.cover instanceof Blob) {
      const url = URL.createObjectURL(book.cover);
      coverUrls.push(url);
      cover = el('img', { className: 'capa', src: url, alt: `Capa de ${book.title}`, loading: 'lazy' });
    } else {
      cover = el('div', { className: 'capa capa-gerada', title: book.title }, book.title);
      cover.style.background = coverColor(book.id);
    }
    const open = el('a', { className: 'cartao-abrir', href: `#/ler/${encodeURIComponent(book.id)}` },
      cover,
      el('span', { className: 'cartao-titulo' }, book.title),
      el('span', { className: 'cartao-autor' }, book.author || ''),
      el('span', { className: 'cartao-info' }, `${book.format.toUpperCase()} · ${formatPercent(book.fraction)}`));
    const remove = el('button', { type: 'button', className: 'cartao-remover' }, 'Remover');
    remove.setAttribute('aria-label', `Remover ${book.title}`);
    remove.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm(`Remover "${book.title}" da biblioteca?`)) return;
      await library.remove(book.id);
      await refresh();
    });
    return el('article', { className: 'cartao' }, open, remove);
  }

  async function importOne(file, single) {
    let result;
    try {
      result = await library.addFile(file);
    } catch (err) {
      if (err instanceof LibraryError && err.code === 'unsupported') {
        showToast(`Formato não suportado: ${file.name}`);
      } else if (err instanceof LibraryError && err.code === 'quota') {
        showToast(`Sem espaço no navegador para este arquivo (${formatSize(file.size)}).`);
      } else {
        showToast(`Não foi possível abrir ${file.name}`);
      }
      return;
    }
    const { book, duplicate } = result;
    if (duplicate) {
      showToast('Este livro já está na biblioteca');
      if (single) onOpen(book.id);
      return;
    }
    try {
      const meta = await extractMeta(file, book.format);
      const fields = {};
      if (meta?.title) fields.title = meta.title;
      if (meta?.author) fields.author = meta.author;
      if (meta?.cover) fields.cover = meta.cover;
      if (Object.keys(fields).length) await library.updateMeta(book.id, fields);
    } catch (err) {
      try { await library.remove(book.id); } catch { /* nada a limpar */ }
      showToast(err?.code === 'drm'
        ? `Este livro tem DRM e não pode ser aberto: ${file.name}`
        : `Não foi possível abrir ${file.name}`);
    }
  }

  // Fila: eventos seguidos (dois drops, dois change) são processados um após o outro.
  let queue = Promise.resolve();
  function importFiles(fileList) {
    const files = [...fileList];
    const run = async () => {
      for (const file of files) {
        try {
          await importOne(file, files.length === 1);
        } catch (err) {
          console.error(err);
          showToast(`Não foi possível abrir ${file.name}`);
        }
        await refresh();
      }
    };
    queue = queue.then(run).catch((err) => console.error(err));
    return queue;
  }

  fileInput.addEventListener('change', async () => {
    const files = [...fileInput.files];
    fileInput.value = '';
    await importFiles(files);
  });

  search.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => { query = search.value; refresh(); }, 150);
  });
  select.addEventListener('change', () => { sort = select.value; refresh(); });

  // Arrastar e soltar; o contador evita o dragleave disparado por filhos.
  let depth = 0;
  const hasFiles = (e) => [...(e.dataTransfer?.types ?? [])].includes('Files');
  root.addEventListener('dragenter', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth++;
    shelf.classList.add('arrastando');
  });
  root.addEventListener('dragover', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    shelf.classList.add('arrastando');
  });
  root.addEventListener('dragleave', (e) => {
    if (!hasFiles(e)) return;
    depth = Math.max(0, depth - 1);
    if (depth === 0) shelf.classList.remove('arrastando');
  });
  root.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth = 0;
    shelf.classList.remove('arrastando');
    importFiles(e.dataTransfer.files);
  });

  return { refresh };
}
