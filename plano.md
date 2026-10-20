# Leitor — Plano de Implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para executar este plano tarefa por tarefa. Os passos usam checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** construir um leitor web estático de PDF, ePub, MOBI/AZW3, FB2 e CBZ, com biblioteca local e retomada da leitura.

**Arquitetura:** site estático em `public/` com módulos ES puros. As regras ficam em módulos sem DOM, testados com `node --test`. A persistência usa IndexedDB, com alternativa em memória. pdf.js e foliate-js ficam em `public/vendor/` e são adaptados a uma interface `Reader` comum.

**Stack:** Node ≥ 20 (somente dev/teste), JavaScript ES2022, IndexedDB, Web Crypto (SHA-256), pdfjs-dist 4.10.38, foliate-js (commit fixo).

**Spec:** [produto.md](produto.md)

## Restrições globais

- Projeto independente na pasta `Code Commit/leitor/` (repositório git próprio). `package.json` com `"type": "module"`, `"engines": { "node": ">=20" }`, scripts `start: node server.js` e `test: node --test test/`.
- Zero dependências npm. Nenhuma requisição a terceiros em tempo de execução.
- Porta de desenvolvimento: **5174**.
- Toda a interface fica em português do Brasil. Os textos fixos são os de `produto.md` §6 e os definidos nas tarefas, exatamente como estão.
- Formatos aceitos (`accept` do input): `.pdf,.epub,.mobi,.azw3,.azw,.fb2,.fbz,.cbz`.
- Fonte: de 14 a 28 px, passo 2, padrão 18. Temas: `claro`, `sepia`, `escuro` (padrão `claro`). Zoom de PDF: `largura` (padrão) ou um número de 0.5 a 3.
- Local de leitura é `string`: `pdf:<página>` (base 1) no PDF e CFI nos demais.
- Salvamento de progresso com debounce de **1000 ms**.

## Pontos de atenção na revisão

1. **Mesmo arquivo importado duas vezes**: não duplica, avisa "Este livro já está na biblioteca" e devolve o livro existente. Teste na Tarefa 4.
2. **Arquivo de formato errado** (`.docx` renomeado para `.pdf`): é recusado com `LibraryError('unsupported')` e não entra no armazenamento. Teste nas Tarefas 2 e 4.
3. **Cota estourada** (`QuotaExceededError` no armazenamento): `LibraryError('quota')` sem deixar registro órfão em `books`. Teste na Tarefa 4.
4. **Posição salva inválida** (`pdf:999` num PDF de 10 páginas, `pdf:abc`, CFI quebrado): abre no início. Teste na Tarefa 6; CFI coberto na verificação da Tarefa 7.
5. **IndexedDB indisponível**: `createStore()` devolve o armazenamento em memória com `persistent: false` e a interface mostra a faixa de modo temporário. Teste na Tarefa 3; faixa verificada na Tarefa 8.

---

### Tarefa 1: Estrutura do projeto, servidor e fixtures

**Arquivos:**
- Criar: `package.json`, `.gitignore` (`node_modules/`, `fixtures/`), `server.js`, `public/index.html`, `public/styles.css`, `tools/make-fixtures.js`, `tools/zip.js`
- Já existe: `.claude/launch.json` (configuração `leitor`: `node server.js`, porta 5174)
- Teste: `test/server.test.js`, `test/zip.test.js`

**Interfaces:**
- Produz:
  - `mimeFor(path: string): string`, exportado de `server.js`. O servidor só sobe quando o arquivo é executado diretamente (`import.meta.url === pathToFileURL(process.argv[1]).href`).
  - `makeZip(entries: {name: string, data: Uint8Array|string}[]): Uint8Array`, em `tools/zip.js`. Gera um ZIP sem compressão (método 0) com CRC-32.
  - `node tools/make-fixtures.js` gera em `fixtures/`:
    - `amostra.pdf`: PDF válido de 3 páginas, escrito à mão, com "Página 1", "Página 2" e "Página 3".
    - `amostra.epub`: ePub 3 mínimo com `mimetype` como primeira entrada, `META-INF/container.xml`, OPF com título "Livro de Amostra" e autor "Autora Teste", nav e 2 capítulos.
    - `amostra.cbz`: 2 imagens PNG 1×1.
    - `falso.pdf`: bytes de texto "isto não é pdf".

- [ ] **Passo 1:** `git init` em `` e criar `package.json`, `.gitignore` e `CLAUDE.md`/`produto.md`/`plano.md` (já existem) no primeiro commit.
- [ ] **Passo 2: teste que falha.** `server.test.js`:
  - `mimeFor('a.mjs') === 'text/javascript; charset=utf-8'`
  - `mimeFor('a.js')` igual ao anterior
  - `mimeFor('a.css') === 'text/css; charset=utf-8'`
  - `mimeFor('a.html') === 'text/html; charset=utf-8'`
  - `mimeFor('a.wasm') === 'application/wasm'`
  - `mimeFor('a.bcmap') === 'application/octet-stream'`
  - `mimeFor('a.xyz') === 'application/octet-stream'`

  `zip.test.js`:
  - `makeZip([{name:'mimetype',data:'application/epub+zip'}])` começa com os bytes `50 4B 03 04`
  - o texto `mimetypeapplication/epub+zip` aparece a partir do offset 30
  - termina com a assinatura EOCD `50 4B 05 06` seguida de 18 bytes
- [ ] **Passo 3:** `npm test` deve FALHAR (módulos inexistentes).
- [ ] **Passo 4:** implementar `server.js`.
  - Servidor `http` estático de `public/`, porta `process.env.PORT || 5174`.
  - Bloqueia `..` no caminho e responde 404 para arquivo inexistente.
  - `/` serve `index.html`.
  - Implementar também `tools/zip.js` e `tools/make-fixtures.js`.
- [ ] **Passo 5:** criar `index.html` com dois contêineres (`<main id="biblioteca">`, `<main id="leitura" hidden>`), um `<div id="avisos" role="status">` e `<script type="module" src="js/app.js">`. Criar `styles.css` com os tokens de cor dos 3 temas em `:root[data-tema=claro|sepia|escuro]`:
  - claro: `--fundo #ffffff`, `--texto #1d1d1f`
  - sepia: `--fundo #f4ecd8`, `--texto #5b4636`
  - escuro: `--fundo #121212`, `--texto #e6e6e6`
- [ ] **Passo 6:** `npm test` deve PASSAR. `node tools/make-fixtures.js` cria os 4 arquivos.
- [ ] **Passo 7:** abrir o preview `leitor` e confirmar que a página carrega sem erro no console.
- [ ] **Passo 8:** commit `feat: estrutura do projeto, servidor e fixtures`.

### Tarefa 2: Detecção de formato

**Arquivos:** Criar `public/js/formats.js` · Teste `test/formats.test.js`

**Interfaces:**
- Produz:
  - `ACCEPT: string`, igual ao das Restrições globais
  - `type Format = 'pdf'|'epub'|'mobi'|'fb2'|'cbz'`
  - `detectFormat(name: string, head: Uint8Array): Format|null`. `head` são os primeiros 4096 bytes.

Ordem de decisão:
1. `%PDF-` no início → `pdf`.
2. ZIP (`PK\x03\x04`):
   - `mimetypeapplication/epub+zip` no offset 30 → `epub`
   - senão, extensão `.cbz` → `cbz`
   - senão, `.fbz` → `fb2`
   - senão, `null`
3. Bytes 60–67 iguais a `BOOKMOBI` → `mobi`. Vale também para `.azw`/`.azw3`.
4. Texto que contém `<FictionBook` → `fb2`.
5. Caso contrário → `null`.

A extensão nunca basta sozinha.

- [ ] **Passo 1: testes que falham.** Usar as fixtures da Tarefa 1 e buffers montados no teste:
  - `amostra.pdf` → `'pdf'`
  - `amostra.epub` → `'epub'`
  - `amostra.cbz` → `'cbz'`
  - `falso.pdf` → `null`
  - buffer de 68 bytes com `BOOKMOBI` em 60 e nome `x.azw3` → `'mobi'`
  - `<?xml version="1.0"?><FictionBook>` → `'fb2'`
  - ZIP sem mimetype com nome `x.epub` → `null`
  - `ACCEPT` igual à string das restrições
- [ ] **Passo 2:** rodar e ver FALHAR.
- [ ] **Passo 3:** implementar `detectFormat`.
- [ ] **Passo 4:** rodar e ver PASSAR.
- [ ] **Passo 5:** commit `feat: detecção de formato`.

### Tarefa 3: Armazenamento (memória e IndexedDB)

**Arquivos:** Criar `public/js/memory-store.js`, `public/js/idb-store.js`, `public/js/store.js` · Teste `test/store.test.js`

**Interfaces:**
- Produz, com `type StoreName = 'books'|'files'|'bookmarks'`:

```
interface Store {
  persistent: boolean
  put(store: StoreName, value: object): Promise<void>   // chave = value.id
  get(store, id: string): Promise<object|undefined>
  getAll(store): Promise<object[]>
  delete(store, id: string): Promise<void>
  usage(): Promise<{usedBytes:number, quotaBytes:number|null}>
}
createMemoryStore(): Store                 // persistent:false; usage soma o .size dos Blobs em 'files'
openIdbStore(idb: IDBFactory): Promise<Store>   // banco 'leitor', versão 1, 3 object stores com keyPath 'id'
createStore(env = globalThis): Promise<Store>   // tenta openIdbStore(env.indexedDB) e, se faltar ou falhar, usa createMemoryStore()
```

`usage()` do IndexedDB usa `navigator.storage.estimate()` quando existe.

- [ ] **Passo 1: testes que falham.**
  - Memória: um `put`/`get`/`getAll`/`delete` completo em cada store.
  - `createStore({})` devolve store com `persistent === false`.
  - `createStore({indexedDB: {open(){ throw new Error('x') }}})` devolve `persistent === false`.
  - `usage()` da memória com um Blob de 10 bytes em `files` dá `usedBytes === 10`.
- [ ] **Passo 2:** FALHAR.
- [ ] **Passo 3:** implementar. O `idb-store` só é verificado no navegador (Tarefa 8).
- [ ] **Passo 4:** PASSAR.
- [ ] **Passo 5:** commit `feat: armazenamento com fallback em memória`.

### Tarefa 4: Biblioteca

**Arquivos:** Criar `public/js/library.js` · Teste `test/library.test.js`

**Interfaces:**
- Consome: `Store` (Tarefa 3) e `detectFormat` (Tarefa 2).
- Produz:

```
class LibraryError extends Error { code: 'unsupported'|'quota'|'not-found' }
type Book = { id, title, author, format, size, addedAt, lastOpenedAt|null,
              cover: Blob|null, location: string|null, fraction: number }   // fraction 0..1
type Bookmark = { id, bookId, location, label, createdAt }
createLibrary(store: Store, { now = Date.now, hash = sha256Hex } = {}) => {
  addFile(file: Blob & {name}, meta?: {title?, author?, cover?}): Promise<{book: Book, duplicate: boolean}>
  list({ sort = 'recentes', query = '' }): Promise<Book[]>  // sort: 'recentes'|'titulo'|'adicionados'
  get(id): Promise<Book>                     // lança LibraryError('not-found')
  getFile(id): Promise<Blob>
  updateMeta(id, meta): Promise<Book>
  markOpened(id): Promise<void>
  saveProgress(id, { location, fraction }): Promise<void>
  remove(id): Promise<void>                  // apaga o livro, o arquivo e os marcadores dele
  addBookmark(bookId, { location, label }): Promise<Bookmark>
  listBookmarks(bookId): Promise<Bookmark[]> // ordenado por createdAt
  removeBookmark(id): Promise<void>
}
sha256Hex(blob): Promise<string>   // crypto.subtle
```

Regras:
- `id` é o SHA-256 do arquivo.
- O título padrão é o nome do arquivo sem extensão, e o autor padrão é `''`.
- `recentes` ordena por `lastOpenedAt ?? addedAt`, decrescente.
- `titulo` usa `localeCompare` com `'pt-BR'` e `{sensitivity:'base'}`.
- `query` filtra título e autor sem diferenciar maiúsculas nem acentos (`normalize('NFD')` removendo os diacríticos).
- `addFile` grava `files` **antes** de `books`. Se `put` lançar um erro com `name === 'QuotaExceededError'`, apaga o que já gravou e lança `LibraryError('quota')`.

- [ ] **Passo 1: testes que falham** (usar `createMemoryStore` e `now` fixo):
  - Importar `amostra.epub` com meta `{title:'Livro de Amostra'}` lista 1 livro com `format 'epub'`.
  - Importar o mesmo arquivo de novo devolve `duplicate: true` e continua 1 livro.
  - `falso.pdf` lança `LibraryError` com `code 'unsupported'` e `getAll('books')` fica vazio.
  - Um store cujo `put('files')` lança `QuotaExceededError` gera `code 'quota'`, sem nada em `books` nem em `files`.
  - Ordenação `titulo` com "Ábaco", "zeta" e "Beta" dá Ábaco, Beta, zeta.
  - `query 'abaco'` encontra "Ábaco".
  - `saveProgress` seguido de `get` devolve o location e a fraction salvos.
  - `remove` apaga também os marcadores.
  - `get('x')` lança `not-found`.
- [ ] **Passo 2:** FALHAR.
- [ ] **Passo 3:** implementar.
- [ ] **Passo 4:** PASSAR.
- [ ] **Passo 5:** commit `feat: regras da biblioteca`.

### Tarefa 5: Preferências, formatação e rotas

**Arquivos:** Criar `public/js/prefs.js`, `public/js/format.js`, `public/js/router.js` · Teste `test/prefs.test.js`, `test/format.test.js`, `test/router.test.js`

**Interfaces:**
- Produz:
  - `loadPrefs(storage?: Storage): {tema, fonte}`. Se o storage estiver ausente, lançar erro ou tiver lixo, devolve o padrão `{tema:'claro', fonte:18}`. Chave: `leitor:prefs`.
  - `savePrefs(prefs, storage?)`. Não lança erro.
  - `clampFont(n): number`. Arredonda para o par mais próximo dentro de 14–28.
  - `formatPercent(f): string`. Exemplos: `0.456` → `'46%'`, `NaN` → `'0%'`.
  - `formatSize(bytes): string`. Exemplos: `1536` → `'1,5 KB'`, `5*1024**2` → `'5,0 MB'`.
  - `formatDate(ms): string`. `toLocaleDateString('pt-BR')`.
  - `parseRoute(hash): {view:'biblioteca'} | {view:'leitura', id}`. `'#/ler/abc'` dá leitura com id `abc`. Qualquer outro valor dá biblioteca.
  - `routeTo(view, id?): string`. Devolve o hash.

- [ ] **Passo 1:** testes que falham com os exemplos acima, mais:
  - `clampFont(13) === 14`, `clampFont(29) === 28`, `clampFont(19) === 20`
  - `loadPrefs` com `getItem` que lança erro devolve o padrão
  - `loadPrefs` com tema `'roxo'` volta para `'claro'`
- [ ] **Passo 2:** FALHAR.
- [ ] **Passo 3:** implementar.
- [ ] **Passo 4:** PASSAR.
- [ ] **Passo 5:** commit `feat: preferências, formatação e rotas`.

### Tarefa 6: Leitor de PDF

**Arquivos:**
- Criar: `public/vendor/pdfjs/` (de `pdfjs-dist@4.10.38`: `build/pdf.min.mjs`, `build/pdf.worker.min.mjs`, `cmaps/`, `standard_fonts/`, `LICENSE`), `public/vendor/README.md`, `public/js/locations.js`, `public/js/reader-pdf.js`
- Teste: `test/locations.test.js`

**Interfaces:**
- Produz a **interface `Reader`**, que a Tarefa 7 também implementa:

```
interface Reader {
  meta(): Promise<{ title?: string, author?: string, cover: Blob|null }>
  toc(): Promise<{ label: string, location: string, children: [] }[]>
  goTo(location: string|null): Promise<void>     // inválido/null → início
  goToFraction(f: number): Promise<void>
  next(): Promise<void>; prev(): Promise<void>
  search(query: string): AsyncIterable<{ location: string, excerpt: string }>
  setTheme(tema): void
  setFontSize(px): void        // PDF: no-op
  setZoom(z: 'largura'|number): void  // foliate: no-op
  onRelocate(cb: ({location, fraction, label}) => void): void   // label ex.: "Página 3 de 10"
  destroy(): void
}
openPdfReader(container: HTMLElement, blob: Blob): Promise<Reader>
toPdfLocation(page: number): string               // 'pdf:3'
parsePdfLocation(loc: string|null, numPages: number): number   // inválido → 1; clamp 1..numPages
```

Como fazer:
- Obter os arquivos com `npm pack pdfjs-dist@4.10.38` numa pasta temporária, extrair só os itens listados acima e registrar a versão e a licença em `vendor/README.md`.
- Mostrar uma página por vez em `<canvas>`, com a camada de texto do pdf.js para seleção.
- `largura` ajusta o zoom ao `container.clientWidth`.
- No tema escuro, aplicar `filter: invert(0.9) hue-rotate(180deg)` ao canvas. No sépia, usar `sepia(0.3)`.
- A capa é a página 1 renderizada a 300 px de largura, convertida em `Blob` PNG.
- `search` percorre `getTextContent()` página a página. O trecho tem 40 caracteres de cada lado.

- [ ] **Passo 1: testes que falham.**
  - `toPdfLocation(3) === 'pdf:3'`
  - `parsePdfLocation('pdf:3', 10) === 3`
  - `parsePdfLocation('pdf:999', 10) === 10`
  - `parsePdfLocation('pdf:abc', 10) === 1`
  - `parsePdfLocation(null, 10) === 1`
  - `parsePdfLocation('epubcfi(/6/4)', 10) === 1`
- [ ] **Passo 2:** FALHAR.
- [ ] **Passo 3:** implementar `locations.js`. Ver PASSAR.
- [ ] **Passo 4:** copiar o vendor e implementar `reader-pdf.js`.
- [ ] **Passo 5: verificação no navegador.** Usar uma página temporária `public/dev-pdf.html` que abre `fixtures/amostra.pdf` por input de arquivo e **será apagada no fim da tarefa**. Conferir:
  - a página renderiza
  - `next` mostra "Página 2 de 3"
  - a busca por "Página 3" encontra 1 resultado
  - `goTo('pdf:99')` vai para a página 3
  - o console não mostra erro
- [ ] **Passo 6:** commit `feat: leitor de PDF`.

### Tarefa 7: Leitor de ePub, MOBI, FB2 e CBZ (foliate-js)

**Arquivos:** Criar `public/vendor/foliate-js/` e `public/js/reader-foliate.js` · Modificar `public/vendor/README.md`

**Interfaces:**
- Consome: a interface `Reader` (Tarefa 6).
- Produz: `openFoliateReader(container: HTMLElement, blob: Blob & {name}): Promise<Reader>`.

Como fazer:
- Copiar o repositório `github.com/johnfactotum/foliate-js` no **último commit da branch `main` no momento da execução**. Registrar o hash do commit e a licença MIT em `vendor/README.md`. Copiar todos os `.js` da raiz e `vendor/` do repositório.
- Usar o elemento `<foliate-view>` (`view.js`): `view.open(file)`, `view.next()`, `view.prev()`, `view.goTo(cfi)`, `view.goToFraction(f)`, o evento `relocate` (`detail.cfi`, `detail.fraction`) e `view.search({query})`, que é um gerador assíncrono. Os resultados com `subitems` viram um item por `cfi`.
- Tema e fonte entram via `view.renderer.setStyles(css)`, com as cores dos tokens da Tarefa 1 e `font-size: <px>px`.
- `meta()` usa `view.book.metadata` (title/author podem ser string, objeto ou lista; normalizar para string) e `view.book.getCover()`.
- `goTo` com CFI inválido captura a exceção e chama `view.renderer.next()` a partir do início (`goToFraction(0)`).
- O `label` de relocate é `formatPercent(fraction)`.

- [ ] **Passo 1:** copiar o vendor e implementar.
- [ ] **Passo 2: verificação no navegador** com uma página temporária `public/dev-foliate.html`, apagada no fim. Conferir:
  - `amostra.epub` abre com o título "Livro de Amostra" e a autora "Autora Teste"
  - `toc()` tem 2 itens
  - `next` dispara `relocate` com `fraction` > 0
  - a busca encontra texto do capítulo 2
  - `goTo('epubcfi(/99!/4)')` abre no início sem erro
  - o tema escuro troca o fundo
  - a fonte 28 aumenta o texto
  - `amostra.cbz` abre e mostra 2 páginas
- [ ] **Passo 3:** commit `feat: leitor de ePub/MOBI/FB2/CBZ`.

### Tarefa 8: Tela da biblioteca

**Arquivos:** Criar `public/js/library-view.js`, `public/js/app.js` · Modificar `public/index.html`, `public/styles.css`

**Interfaces:**
- Consome: `createStore`, `createLibrary`, `ACCEPT`, `formatPercent`/`formatSize`, `parseRoute`/`routeTo`, `openPdfReader`/`openFoliateReader` (só para extrair `meta()` na importação, num contêiner fora da tela, e chamar `destroy()` em seguida).
- Produz:
  - `mountLibraryView(root: HTMLElement, { library, store, onOpen(id) }): { refresh(): Promise<void> }`
  - `app.js` com `showToast(msg: string)` exportado e a função de roteamento `render()` ligada a `hashchange`.

Textos e comportamento:
- Cabeçalho "Biblioteca" com o botão "Adicionar livros" (`<input type=file multiple accept=ACCEPT>`) e a busca (placeholder "Buscar por título ou autor").
- Ordenação `<select>` com: Lidos recentemente, Título, Adicionados recentemente.
- Estante vazia: "Arraste PDFs ou ebooks para cá ou use Adicionar livros."
- Arrastar arquivos destaca a área com a classe `arrastando`.
- Cartão do livro:
  - capa (ou a capa gerada: `<div>` com o título e uma cor de fundo derivada do id)
  - título, autor, formato em maiúsculas, `formatPercent(fraction)`
  - botão "Remover", que pede `confirm('Remover "<título>" da biblioteca?')`
- Clicar no cartão abre `#/ler/<id>`.
- Rodapé: "Espaço usado: <formatSize>".
- Mensagens (toast):
  - "Formato não suportado: <nome>"
  - "Sem espaço no navegador para este arquivo (<tamanho>)."
  - "Este livro já está na biblioteca"
  - "Não foi possível abrir <nome>" (falha do leitor, como DRM ou arquivo corrompido). Nesse caso, remover o livro recém-adicionado.
- Com `store.persistent === false`, mostrar a faixa fixa "Modo temporário: a biblioteca não será salva neste navegador."
- Layout responsivo: grade `repeat(auto-fill, minmax(140px, 1fr))`, margem lateral de 16 px no celular e sem rolagem horizontal.

- [ ] **Passo 1:** implementar.
- [ ] **Passo 2: verificação no navegador** (preview `leitor`). Conferir:
  - importar `amostra.pdf` e `amostra.epub` por input mostra 2 cartões com capa e título
  - importar `amostra.epub` de novo mostra o aviso de duplicado
  - `falso.pdf` mostra o aviso de formato
  - recarregar a página mantém os livros (IndexedDB)
  - a busca "amostra" filtra
  - "Remover" apaga
  - com `resize_window` em mobile, a página não tem rolagem horizontal
  - simular a falta de IndexedDB (sobrescrever `window.indexedDB = undefined` antes de carregar `app.js` via um parâmetro de dev `?semidb`) mostra a faixa de modo temporário
- [ ] **Passo 3:** commit `feat: tela da biblioteca`.

### Tarefa 9: Tela de leitura

**Arquivos:** Criar `public/js/reader-view.js` · Modificar `public/js/app.js`, `public/index.html`, `public/styles.css`

**Interfaces:**
- Consome: `Reader` (Tarefas 6 e 7), `library` (Tarefa 4), `loadPrefs`/`savePrefs`/`clampFont` (Tarefa 5), `showToast` (Tarefa 8).
- Produz: `mountReaderView(root, { library, id, onClose }): Promise<{ destroy(): void }>`. Se o livro não existir, chama `showToast('Livro não encontrado.')` e `onClose()`.

Comportamento:
- Escolhe `openPdfReader` quando `book.format === 'pdf'` e `openFoliateReader` nos demais. Chama `library.markOpened(id)` e `reader.goTo(book.location)`.
- `onRelocate` atualiza a barra inferior (label e controle deslizante `0–100`) e chama `library.saveProgress` com debounce de 1000 ms. Também salva em `pagehide` e ao fechar.
- Barra superior, com estes rótulos e `aria-label`:
  - "Voltar à biblioteca"
  - título do livro
  - "Sumário"
  - "Buscar"
  - "Marcadores"
  - "Aparência"
  - "Tela cheia"
- Os painéis laterais abrem um de cada vez:
  - **Sumário**: lista aninhada.
  - **Buscar**: campo de busca com resultados que vão chegando, cada um com o trecho. "Nenhum resultado" quando não há nenhum.
  - **Marcadores**: botão "Adicionar marcador aqui" (o rótulo é o label atual) e a lista com data e "Remover".
  - **Aparência**: botões Claro, Sépia e Escuro. "A−"/"A+" para a fonte, oculto no PDF. Zoom "Ajustar à largura", "−" e "+" (passo de 0.25, de 0.5 a 3), oculto fora do PDF.
- O tema é aplicado em `document.documentElement.dataset.tema` e no `reader.setTheme`. As preferências são salvas.
- Teclado (ignorado quando o foco está num input):
  - ←, PageUp: `prev`
  - →, PageDown, espaço: `next`
  - Esc: fecha o painel aberto ou, sem painel aberto, volta
- Clicar nos 20% laterais da área de leitura também vira a página.
- "Tela cheia" usa `document.documentElement.requestFullscreen()`.

- [ ] **Passo 1:** implementar.
- [ ] **Passo 2: verificação no navegador.** Conferir:
  - abrir o PDF, avançar 2 páginas, recarregar e voltar à página 3
  - abrir o ePub, avançar, voltar à biblioteca e ver o % do cartão maior que 0
  - o sumário navega
  - a busca encontra e o clique navega
  - adicionar marcador, ir até ele e remover
  - o tema escuro persiste depois de recarregar
  - `#/ler/inexistente` volta com "Livro não encontrado."
  - as setas do teclado viram a página
  - em mobile, a barra superior cabe e não há rolagem horizontal
  - o console não mostra erros
- [ ] **Passo 3:** commit `feat: tela de leitura`.

### Tarefa 10: README e verificação final

**Arquivos:** Criar `README.md` (como rodar, formatos, privacidade, tabela de hospedagem: Netlify, Vercel, GitHub Pages e Cloudflare Pages publicando `public/` sem build, estrutura) · Remover qualquer `public/dev-*.html` que tenha sobrado.

- [ ] **Passo 1:** escrever o README.
- [ ] **Passo 2:** `npm test` deve passar por completo.
- [ ] **Passo 3:** confirmar em `read_network_requests` que não há requisições para fora de `localhost` durante a importação e a leitura.
- [ ] **Passo 4:** commit `docs: README`.
