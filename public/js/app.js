// Inicialização: tema, armazenamento, biblioteca e troca de telas por hash.
import { createStore } from './store.js';
import { createLibrary } from './library.js';
import { loadPrefs } from './prefs.js';
import { parseRoute, routeTo } from './router.js';
import { mountLibraryView } from './library-view.js';
import { mountReaderView } from './reader-view.js';
import { showToast } from './toast.js';

export { showToast };

document.documentElement.dataset.tema = loadPrefs().tema;

const libraryEl = document.getElementById('biblioteca');
const readerEl = document.getElementById('leitura');

// `?semidb` simula IndexedDB ausente (desenvolvimento).
const semidb = new URLSearchParams(location.search).has('semidb');
const store = await createStore(semidb ? {} : globalThis);
const library = createLibrary(store);

const libraryView = mountLibraryView(libraryEl, {
  library,
  store,
  onOpen: (id) => { location.hash = routeTo('leitura', id); },
});

// Tela de leitura atual. Trocar de rota aborta a montagem em andamento ou destrói a tela pronta.
let readerAbort = null;
let readerHandle = null;

function closeReader() {
  readerAbort?.abort();
  readerAbort = null;
  readerHandle?.destroy();
  readerHandle = null;
  readerEl.textContent = '';
}

function showReader(id) {
  closeReader();
  const abort = new AbortController();
  readerAbort = abort;
  mountReaderView(readerEl, {
    library,
    id,
    signal: abort.signal,
    onClose: () => { location.hash = routeTo('biblioteca'); },
  }).then((handle) => {
    if (abort.signal.aborted) handle.destroy();
    else readerHandle = handle;
  }).catch((err) => {
    console.error(err);
  });
}

function render() {
  const route = parseRoute(location.hash);
  if (route.view === 'leitura') {
    libraryEl.hidden = true;
    readerEl.hidden = false;
    showReader(route.id);
  } else {
    closeReader();
    readerEl.hidden = true;
    libraryEl.hidden = false;
    libraryView.refresh();
  }
}

window.addEventListener('hashchange', render);
render();
