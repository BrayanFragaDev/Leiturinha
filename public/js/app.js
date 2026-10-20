// Inicialização: tema, armazenamento, biblioteca e troca de telas por hash.
import { createStore } from './store.js';
import { createLibrary } from './library.js';
import { loadPrefs } from './prefs.js';
import { parseRoute, routeTo } from './router.js';
import { mountLibraryView } from './library-view.js';
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

// Ponto de integração da Tarefa 9: montar a tela de leitura em #leitura.
function showReader(id) {
  readerEl.textContent = `Leitura de ${id} (em construção).`;
}

function render() {
  const route = parseRoute(location.hash);
  if (route.view === 'leitura') {
    libraryEl.hidden = true;
    readerEl.hidden = false;
    showReader(route.id);
  } else {
    readerEl.hidden = true;
    readerEl.textContent = '';
    libraryEl.hidden = false;
    libraryView.refresh();
  }
}

window.addEventListener('hashchange', render);
render();
