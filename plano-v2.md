# Leitor v2 — Plano de Implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para executar este plano tarefa por tarefa. Os passos usam checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** acrescentar ao Leitor v1 grifos e notas (com lista por livro e exportação em Markdown) e transformá-lo em PWA instalável que abre sem internet, com aviso de nova versão.

**Arquitetura:**
- As regras novas ficam em módulos puros testados com `node --test`: esquema do banco, grifos, exportação, modo do service worker, lista de precache e roteamento do SW.
- O banco `leitor` sobe da versão 1 para a 2 com uma migração só aditiva (nova store `highlights`).
- A interface `Reader` ganha seleção e desenho de grifos, implementada no adaptador do foliate-js (overlayer) e no do pdf.js (camada própria entre o canvas e a camada de texto).
- O service worker é um script clássico em `public/sw.js`. A lista de arquivos e a versão do cache vêm de `public/sw-manifest.js`, gerado por `node tools/precache.js` e versionado no git.

**Stack:** a mesma da v1 (Node ≥ 20 só para dev/teste, ES2022, IndexedDB, pdfjs-dist 4.10.38, foliate-js no commit fixo de `public/vendor/README.md`), mais Service Worker, Cache Storage e Web App Manifest. Sem dependências novas.

**Spec:** [produto-v2.md](produto-v2.md) (v1: [produto.md](produto.md), [plano.md](plano.md))

## Restrições globais

- Valem todas as restrições da v1 ([plano.md](plano.md) e [CLAUDE.md](CLAUDE.md)): zero dependências npm, sem build, sem requisição a terceiros, interface em pt-BR e nomes no código em inglês, `localStorage`/IndexedDB em try/catch, `public/vendor/` intocado, telas só falam com a interface `Reader`.
- **CSP:** sem `'unsafe-eval'`, sem origens remotas e sem `*`. `script-src` continua exatamente `'self'`. A única mudança da v2 é acrescentar `manifest-src 'self'` (Tarefa 9). As três cópias da política mudam juntas: meta de `public/index.html`, `public/_headers` e `firebase.json`.
- **Banco:** nome `leitor`, versão **2**. Migrações só criam stores; nunca apagam, renomeiam nem reescrevem registros. Toda store usa `keyPath: 'id'`.
- **Cores de grifo:** `amarelo` (padrão), `verde`, `azul` e `rosa`, nesta ordem. Hex: `#f5c400`, `#3fb950`, `#4a90e2` e `#e85d9e`. Desenho semitransparente (opacidade 0.35 no PDF; no foliate, o padrão do `Overlayer.highlight`).
- Limites: texto guardado do grifo com até **5000** caracteres; nota com até **2000**.
- Local de grifo: CFI de intervalo (foliate) ou `pdf:<página>` com `rects` normalizados 0–1 (PDF).
- Os textos de interface são os de `produto-v2.md` §4 e §6 e os definidos nas tarefas, exatamente como estão. Texto vindo do livro ou da pessoa (trecho, nota, rótulo) entra no DOM **só** por `textContent`.
- Páginas de verificação temporárias (`public/dev-*.html` e `.js`) não podem ter script inline (a CSP bloqueia). Use um módulo `.js` separado e apague os dois no fim da tarefa.
- **A partir da Tarefa 10**, toda tarefa que altera algo em `public/` roda `node tools/precache.js` antes do commit e inclui `public/sw-manifest.js` no commit. O teste da Tarefa 10 falha se isso for esquecido.
- Em `localhost`, o service worker só é registrado com `?sw` na URL (Tarefa 12). Sem o parâmetro, o app remove um registro antigo.

## Pontos de atenção na revisão

1. **Migração sem perda:** livros, arquivos, progresso e marcadores da v1 sobrevivem à subida para a versão 2.
   - Testes na Tarefa 1 (`applyUpgrade` com banco falso) e na Tarefa 3 (dados no formato v1 no `memory-store`).
   - Verificação no navegador com dados reais da v1 na Tarefa 1.
2. **Bloqueio da migração não cai no modo temporário:** com outra aba presa na v1, o app espera e mostra a faixa. Tarefa 1.
3. **Remover o livro apaga os grifos.** Teste na Tarefa 3.
4. **Grifo duplicado:** o mesmo trecho não gera dois registros. Teste na Tarefa 3.
5. **CSP intacta** nas três cópias, com `manifest-src 'self'` e sem `'unsafe-eval'` nem origens remotas. Teste na Tarefa 9; console sem violação nas Tarefas 7 e 12.
6. **Versão do cache:** muda quando o conteúdo muda e não muda com o fim de linha. O checkout local no Windows usa CRLF (`core.autocrlf=true`) e o do CI usa LF. O manifesto do SW não pode ficar desatualizado. Testes na Tarefa 10.
7. **Subcaminho do GitHub Pages:** SW, escopo, manifest e ícones funcionam em `/Leiturinha/`. Teste na Tarefa 11; verificação na Tarefa 12 com `--base`.
8. **Atualização só com o consentimento da pessoa:** nada de `skipWaiting` automático. A posição de leitura é salva antes do recarregamento. Tarefa 12.
9. **Injeção de HTML:** trecho, nota e rótulo nunca passam por `innerHTML`. Na exportação, o Markdown é escapado (Tarefa 4).

---

### Tarefa 1: Esquema do banco, migração v1→v2 e faixa do app

**Arquivos:**
- Criar: `public/js/schema.js`, `public/js/banner.js`
- Modificar: `public/js/idb-store.js`, `public/js/memory-store.js`, `public/js/store.js`, `public/js/app.js`, `public/index.html`, `public/styles.css`
- Teste: criar `test/schema.test.js`; modificar `test/store.test.js`

**Interfaces:**
- Produz:

```
// schema.js (puro)
export const DB_NAME = 'leitor'
export const DB_VERSION = 2
export const MIGRATIONS = [
  { version: 1, create: ['books', 'files', 'bookmarks'] },
  { version: 2, create: ['highlights'] },
]
export const STORE_NAMES: string[]   // ['books', 'files', 'bookmarks', 'highlights'], derivado de MIGRATIONS
export function applyUpgrade(
  db: { objectStoreNames: { contains(name: string): boolean }, createObjectStore(name: string, opts: object): unknown },
  oldVersion: number,
  newVersion: number = DB_VERSION,
): string[]
// Percorre MIGRATIONS com oldVersion < version <= newVersion, em ordem, e cria com { keyPath: 'id' }
// cada store que ainda não existe. Devolve os nomes criados. Nunca chama deleteObjectStore.

// idb-store.js
openIdbStore(idb: IDBFactory, opts?: {
  onBlocked?: () => void,        // outra conexão (aba na v1) impede a migração; NÃO rejeita, continua esperando
  onUnblocked?: () => void,      // chamado no onsuccess se onBlocked tiver sido chamado antes
  onVersionChange?: () => void,  // outra aba abriu uma versão mais nova; a conexão já foi fechada
}): Promise<Store>

// store.js
createStore(env = globalThis, opts = {}): Promise<Store>   // repassa opts para openIdbStore

// banner.js (DOM)
showBanner({ text: string, actionLabel?: string, onAction?: () => void }): void   // uma faixa por vez; substitui a anterior
hideBanner(): void
```

- `type StoreName` passa a ser `'books'|'files'|'bookmarks'|'highlights'`.
- `memory-store.js` cria as tabelas a partir de `STORE_NAMES`.
- `idb-store.js` usa `indexedDB.open(DB_NAME, DB_VERSION)` e, no `onupgradeneeded`, chama `applyUpgrade(req.result, event.oldVersion)`.
- `idb-store.js` instala `db.onversionchange = () => { db.close(); opts.onVersionChange?.() }`.
- Erro ou aborto da transação de upgrade rejeita a promessa. `createStore` cai na memória, como na v1.

Faixa do app:
- `index.html` ganha `<div id="faixa-app" class="faixa-app" role="status" hidden></div>` antes de `#avisos`.
- A faixa mostra o texto e, se houver `actionLabel`, um `<button type="button">` que chama `onAction`.
- CSS: `position: sticky; top: 0`, fundo `var(--destaque)`, texto branco, padding de 8px 16px, sem rolagem horizontal no celular.

Ligação em `app.js` (textos exatos):
- `onBlocked`: `showBanner({ text: 'Feche as outras abas do Leitor para concluir a atualização.' })`.
- `onUnblocked`: `hideBanner()`.
- `onVersionChange`: `showBanner({ text: 'O Leitor foi atualizado em outra aba. Recarregue esta página.', actionLabel: 'Recarregar', onAction: () => location.reload() })`.

- [ ] **Passo 1: testes que falham.** Em `schema.test.js`, use um banco falso:

```js
function fakeDb(existing = {}) {
  const stores = new Map(Object.entries(existing)); // nome -> { opts, records: Map }
  return {
    stores,
    objectStoreNames: { contains: (n) => stores.has(n) },
    createObjectStore(n, opts) {
      if (stores.has(n)) throw new Error('ConstraintError');
      stores.set(n, { opts, records: new Map() });
    },
    deleteObjectStore() { throw new Error('não pode apagar'); },
  };
}
```

  Casos:
  - `DB_VERSION === 2`.
  - `STORE_NAMES` igual a `['books','files','bookmarks','highlights']`.
  - `applyUpgrade(fakeDb(), 0)` devolve os 4 nomes, em ordem, todos com `opts` igual a `{ keyPath: 'id' }`.
  - **v1→v2:** monte um banco falso com `books`, `files` e `bookmarks`, cada um com 1 registro (livro `{id:'h1', title:'Livro', location:'pdf:3', fraction:0.5, ...}`, arquivo `{id:'h1', blob}` e marcador `{id:'m1', bookId:'h1', ...}`). `applyUpgrade(db, 1)` devolve `['highlights']`, e os três registros continuam `deepEqual` aos originais.
  - `applyUpgrade(db, 1)` num banco que já tem `highlights` devolve `[]` sem lançar erro.
  - `applyUpgrade(db, 2)` devolve `[]`.
  - `deleteObjectStore` nunca é chamado (o falso lança erro).

  Em `store.test.js`:
  - O laço `put/get/getAll/delete` passa a usar `STORE_NAMES`, o que inclui `highlights`.
  - `createMemoryStore().put('outra', {id:'x'})` rejeita com "Store desconhecido".
- [ ] **Passo 2:** `npm test` deve FALHAR.
- [ ] **Passo 3:** implementar `schema.js`, `banner.js` e as mudanças em `idb-store.js`, `memory-store.js`, `store.js`, `app.js`, `index.html` e `styles.css`.
- [ ] **Passo 4:** `npm test` deve PASSAR.
- [ ] **Passo 5: verificação no navegador com dados da v1.**
  1. Crie uma cópia da v1: `git worktree add --detach ../leitor-v1 master`.
  2. Pare o preview `leitor`. Em `../leitor-v1`, rode `node tools/make-fixtures.js` e `node server.js` (porta 5174) em segundo plano.
  3. Abra `http://localhost:5174/`. Importe `fixtures/amostra.pdf` e `fixtures/amostra.epub`.
  4. Abra o PDF, vá até a página 3, adicione um marcador e volte à biblioteca.
  5. No console, anote o que `await indexedDB.databases()` mostra (versão 1) e a quantidade de registros em `books`, `files` e `bookmarks`.
  6. Pare o servidor da v1 e inicie o preview `leitor` (v2) na mesma porta.
  7. Recarregue e confira:
     - os 2 cartões, com o mesmo % de antes
     - o PDF reabre na página 3
     - o marcador continua na lista
     - `indexedDB.databases()` mostra a versão 2
     - abrindo `leitor` no console, `objectStoreNames` tem as 4 stores e as contagens não mudaram
- [ ] **Passo 6: verificação de bloqueio.**
  1. Apague o banco (`indexedDB.deleteDatabase('leitor')`, com o app fechado).
  2. Numa aba B da mesma origem que não carrega o app (por exemplo, `http://localhost:5174/styles.css`), rode no console `indexedDB.open('leitor', 1)` criando as 3 stores no `onupgradeneeded`. Guarde a conexão em `window.db`, sem `onversionchange`.
  3. Na aba A, abra o app. Deve aparecer a faixa "Feche as outras abas do Leitor para concluir a atualização.", sem a faixa de modo temporário.
  4. Na aba B, rode `db.close()`. Na aba A, a faixa some e a biblioteca aparece.
- [ ] **Passo 7: verificação de versionchange.**
  1. Com o app aberto na aba A, rode na aba B `const r = indexedDB.open('leitor', 3); r.onupgradeneeded = () => r.transaction.abort();`.
  2. A aba A mostra "O Leitor foi atualizado em outra aba. Recarregue esta página." com **Recarregar**.
  3. Confirme que `indexedDB.databases()` continua na versão 2 e que Recarregar volta ao normal.
- [ ] **Passo 8:** `git worktree remove ../leitor-v1`. Console sem erros além dos esperados nos passos 6 e 7.
- [ ] **Passo 9:** commit `feat: banco versão 2 com migração aditiva e faixa do app`.

### Tarefa 2: Regras puras de grifos

**Arquivos:** Criar `public/js/highlights.js` · Teste `test/highlights.test.js`

**Interfaces:**
- Consome: `compare` de `public/vendor/foliate-js/epubcfi.js` (importado por `'../vendor/foliate-js/epubcfi.js'`; o módulo é puro no topo e carrega no Node).
- Produz:

```
export const HIGHLIGHT_COLORS = ['amarelo', 'verde', 'azul', 'rosa']
export const DEFAULT_COLOR = 'amarelo'
export const COLOR_HEX = { amarelo: '#f5c400', verde: '#3fb950', azul: '#4a90e2', rosa: '#e85d9e' }
export const COLOR_LABELS = { amarelo: 'Amarelo', verde: 'Verde', azul: 'Azul', rosa: 'Rosa' }
export const TEXT_MAX = 5000
export const NOTE_MAX = 2000
type HighlightColor = 'amarelo'|'verde'|'azul'|'rosa'
type Rect = { x: number, y: number, w: number, h: number }   // frações 0..1 da página

export function normalizeColor(c: unknown): HighlightColor          // inválido → 'amarelo'
export function cleanText(s: unknown): string
export function cleanNote(s: unknown): string
export function normalizeRects(
  clientRects: Iterable<{ left: number, top: number, width: number, height: number }>,
  box: { left: number, top: number, width: number, height: number },
): Rect[]
export function hitTest(rects: Rect[], x: number, y: number): boolean   // x, y em frações
export function sameAnchor(a: { location, rects }, b: { location, rects }): boolean
export function compareHighlights(a: Highlight, b: Highlight): number
export function sortHighlights(list: Highlight[]): Highlight[]           // cópia ordenada
```

Regras:
- `cleanText`:
  - qualquer sequência de espaço em branco (inclui `\n`, `\t` e NBSP `\u00a0`) vira um espaço, com `trim`
  - acima de `TEXT_MAX`, corta em `TEXT_MAX - 1` e acrescenta `…`
  - não string → `''`
- `cleanNote`:
  - `\r\n` e `\r` viram `\n`, com `trim` nas pontas
  - acima de `NOTE_MAX`, corta em `NOTE_MAX` (sem `…`)
  - não string → `''`
- `normalizeRects`:
  1. descarta retângulos com `width < 1` ou `height < 1` (px)
  2. converte para frações de `box`
  3. recorta em [0, 1]
  4. junta os retângulos da mesma linha: a sobreposição vertical é ≥ 50% da menor altura e a distância horizontal entre eles é ≤ 0.01
  5. arredonda para 4 casas
  6. ordena por `y` e depois por `x`
- `hitTest`: borda incluída.
- `sameAnchor`: mesmo `location` e `JSON.stringify(a.rects ?? null) === JSON.stringify(b.rects ?? null)`.
- `compareHighlights`:
  - Dois locais `pdf:<n>`: compara a página como número. Na mesma página, compara o menor `y` dos `rects` e depois o menor `x`.
  - Dois CFIs: usa `compare` do epubcfi.
  - Locais de tipos diferentes: PDF vem antes.
  - Empate em tudo: `createdAt` crescente.

- [ ] **Passo 1: testes que falham.**
  - `normalizeColor('verde') === 'verde'`, `normalizeColor('roxo') === 'amarelo'` e `normalizeColor(undefined) === 'amarelo'`.
  - `cleanText('a\n\n  b\u00a0c ') === 'a b c'`.
  - `cleanText('x'.repeat(6000))` tem comprimento 5000 e termina em `…`.
  - `cleanText(42) === ''`.
  - `cleanNote('  linha 1\r\nlinha 2  ') === 'linha 1\nlinha 2'`.
  - `cleanNote('y'.repeat(2500)).length === 2000`.
  - `normalizeRects` com `box {left:100, top:100, width:1000, height:1000}`:
    - `[{left:110,top:200,width:50,height:20}, {left:160,top:201,width:40,height:20}]` → `[{x:0.01, y:0.1, w:0.09, h:0.021}]`
    - `[{left:110,top:200,width:50,height:20}, {left:110,top:230,width:50,height:20}]` → 2 retângulos, o de `y` 0.1 primeiro
    - `[{left:110,top:200,width:0,height:20}]` → `[]`
    - `[{left:50,top:200,width:100,height:20}]` → `[{x:0, y:0.1, w:0.05, h:0.02}]` (recorte)
  - `hitTest([{x:0.1,y:0.1,w:0.2,h:0.05}], 0.15, 0.12) === true`; `(…, 0.31, 0.12) === false`; `(…, 0.3, 0.15) === true` (borda).
  - `sameAnchor` dá verdadeiro para o mesmo CFI com `rects` null e falso para `pdf:3` com `rects` diferentes.
  - `sortHighlights`:
    - `pdf:10` vem depois de `pdf:2`
    - na mesma página, `y` 0.2 vem antes de `y` 0.5
    - `epubcfi(/6/4!/4/2,/1:0,/1:5)` vem antes de `epubcfi(/6/4!/4/10,/1:0,/1:3)`, que vem antes de `epubcfi(/6/8!/4/2,/1:0,/1:5)`
    - no empate, o `createdAt` menor vem primeiro
    - a lista original não é alterada
- [ ] **Passo 2:** FALHAR.
- [ ] **Passo 3:** implementar.
- [ ] **Passo 4:** PASSAR.
- [ ] **Passo 5:** commit `feat: regras puras de grifos`.

### Tarefa 3: Grifos na biblioteca

**Arquivos:** Modificar `public/js/library.js` · Teste `test/library.test.js`

**Interfaces:**
- Consome: `Store` com `highlights` (Tarefa 1); `normalizeColor`, `cleanText`, `cleanNote`, `sameAnchor` e `sortHighlights` (Tarefa 2).
- Produz (acréscimos ao objeto de `createLibrary`):

```
type Highlight = {
  id: string, bookId: string,
  location: string,          // CFI de intervalo ou 'pdf:<página>'
  rects: Rect[] | null,      // só PDF
  text: string,              // cleanText
  label: string,             // capítulo ou 'Página N'; '' se desconhecido
  color: HighlightColor,
  note: string,              // cleanNote; '' = sem nota
  createdAt: number, updatedAt: number,
}
LibraryError.code ganha 'invalid' (mensagem 'Grifo inválido.')

addHighlight(bookId, { location, rects = null, text, label = '', color }): Promise<{ highlight: Highlight, existing: boolean }>
listHighlights(bookId): Promise<Highlight[]>                     // sortHighlights
updateHighlight(id, { color?, note? }): Promise<Highlight>       // LibraryError('not-found') se não existir
removeHighlight(id): Promise<void>
remove(id)                                                       // passa a apagar também os grifos do livro
```

Regras:
- `addHighlight`:
  - lança `not-found` se o livro não existir
  - lança `invalid` se `location` não for string não vazia ou se `cleanText(text)` for `''`
  - se já houver um grifo do mesmo livro com `sameAnchor`, atualiza só `color` e `updatedAt` e devolve `existing: true`
  - um grifo novo nasce com `id = crypto.randomUUID()`, `note: ''` e `createdAt = updatedAt = now()`
- `updateHighlight`: atualiza só os campos presentes (`color` passa por `normalizeColor`, `note` por `cleanNote`) e grava `updatedAt = now()`.
- `remove(id)`: apaga, em ordem, grifos, marcadores, arquivo e livro.

- [ ] **Passo 1: testes que falham** (`createMemoryStore`, `now` fixo e incremental):
  - `addHighlight` num livro importado devolve `existing:false`, `color 'verde'`, `note ''` e `text` limpo. `listHighlights` tem 1 item.
  - Chamar de novo com o mesmo `location` e `color 'azul'` devolve `existing:true` com o mesmo `id`, a lista continua com 1 item e a cor passa a `azul`.
  - PDF: `pdf:1` com `rects` diferentes gera 2 grifos.
  - `addHighlight('inexistente', …)` lança `not-found`.
  - `location ''` lança `invalid`; `text '   '` lança `invalid`.
  - `listHighlights` devolve os de `pdf:3`, `pdf:1` e `pdf:2` na ordem 1, 2, 3, e só os do livro pedido.
  - `updateHighlight(id, {note:'  oi  '})` dá `note 'oi'`, `color` inalterada e `updatedAt` maior.
  - `updateHighlight('x', {})` lança `not-found`.
  - `removeHighlight` tira da lista.
  - `remove(bookId)` deixa `getAll('highlights')` sem nenhum grifo daquele livro e mantém os de outro livro.
  - **Dados no formato da v1:** grave direto no `memory-store` um livro sem nenhum campo novo e um marcador (`{id, bookId, location, label, createdAt}`). Confira:
    - `list()` devolve o livro
    - `listBookmarks` devolve o marcador
    - `listHighlights` devolve `[]`
    - `addHighlight` funciona
    - `get(bookId)` continua `deepEqual` ao registro gravado (grifar não altera o livro)
- [ ] **Passo 2:** FALHAR.
- [ ] **Passo 3:** implementar.
- [ ] **Passo 4:** PASSAR.
- [ ] **Passo 5:** commit `feat: grifos e notas na biblioteca`.

### Tarefa 4: Exportação das notas em Markdown

**Arquivos:** Criar `public/js/notes-export.js` · Teste `test/notes-export.test.js`

**Interfaces:**
- Consome: o tipo `Highlight` (Tarefa 3).
- Produz:

```
export function escapeMarkdown(s: string): string      // prefixa '\' em: \ ` * _ [ ] < > # | ~
export function toMarkdown(book: { title: string, author: string }, highlights: Highlight[], { date }: { date: string }): string
export function markdownFileName(title: string): string
```

Formato de `toMarkdown`:
- `highlights` já chega ordenado.
- Blocos separados por exatamente uma linha em branco, e o arquivo termina com um único `\n`. Em ordem:
  1. `# <título escapado>`
  2. o autor escapado, só se não for vazio
  3. `Grifos e notas exportados do Leitor em <date>.`
  4. para cada grifo:
     - quando o `label` muda em relação ao grifo anterior (ou no primeiro), um bloco `## <label escapado ou 'Sem capítulo'>`
     - um bloco `> <texto escapado>`
     - se houver nota, um bloco `**Nota:** ` seguido das linhas da nota escapadas e unidas por `'  \n'` (quebra de linha forçada)
  5. com a lista vazia, depois do bloco 3 vem só `Nenhum grifo neste livro.`

`markdownFileName`:
- `normalize('NFD')` sem diacríticos, em minúsculas
- sequências fora de `[a-z0-9]` viram `-`, sem `-` nas pontas
- corta em 60 caracteres e tira o `-` final
- vazio vira `livro`
- acrescenta `-notas.md`

- [ ] **Passo 1: testes que falham.**
  - `escapeMarkdown('um *leitor* #1 [x]') === 'um \\*leitor\\* \\#1 \\[x\\]'`.
  - `toMarkdown({title:'Livro de Amostra', author:'Autora Teste'}, [h1, h2, h3], {date:'20/10/2026'})` é igual a esta string exata:
    - `h1`: `label` `'Capítulo 1'`, `text` `'Era uma vez'`, sem nota
    - `h2`: `label` `'Capítulo 1'`, `text` `'um *leitor*'`, `note` `'Rever\nisto'`
    - `h3`: `label` `'Capítulo 2'`, `text` `'girassol'`, sem nota

```
# Livro de Amostra

Autora Teste

Grifos e notas exportados do Leitor em 20/10/2026.

## Capítulo 1

> Era uma vez

> um \*leitor\*

**Nota:** Rever  
isto

## Capítulo 2

> girassol
```

  - Com autor vazio, a linha do autor (e a linha em branco dela) some.
  - Com `label ''`, o cabeçalho fica `## Sem capítulo`.
  - Com a lista vazia, termina em `Nenhum grifo neste livro.\n`.
  - `markdownFileName('Dom Casmurro: Edição Crítica') === 'dom-casmurro-edicao-critica-notas.md'`.
  - `markdownFileName('???') === 'livro-notas.md'`.
  - `markdownFileName('a'.repeat(100))` tem 60 letras antes de `-notas.md`.
- [ ] **Passo 2:** FALHAR.
- [ ] **Passo 3:** implementar.
- [ ] **Passo 4:** PASSAR.
- [ ] **Passo 5:** commit `feat: exportar notas em Markdown`.

### Tarefa 5: Grifos no leitor foliate (ePub, MOBI, FB2)

**Arquivos:** Modificar `public/js/reader-foliate.js` · Verificação: `public/dev-grifos.html` e `public/dev-grifos.js`, temporários

**Interfaces:**
- Consome: `COLOR_HEX` e `cleanText` (Tarefa 2); `Overlayer` de `../vendor/foliate-js/overlayer.js`.
- Produz os **acréscimos da v2 à interface `Reader`**, que a Tarefa 6 também implementa (registre-os no comentário do topo dos dois adaptadores):

```
type TextSelection = { location: string, text: string, label: string, rects: Rect[] | null }
type DrawnHighlight = { id: string, location: string, rects: Rect[] | null, color: HighlightColor }

interface Reader {                    // v1 + o que segue
  goTo(location: string|null, opts?: { strict?: boolean }): Promise<boolean>
      // v2: devolve true se chegou ao local. strict:true com local inválido devolve false e não sai do lugar.
      // Sem strict, o comportamento da v1 continua: inválido → início, devolvendo false.
  readonly supportsHighlights: boolean      // foliate: !view.isFixedLayout (CBZ e ePub de layout fixo → false)
  onSelect(cb: (sel: TextSelection | null) => void): void   // null quando a seleção some
  clearSelection(): void
  setHighlights(list: DrawnHighlight[]): void   // substitui o conjunto desenhado; chamar de novo com a mesma lista é seguro
  onHighlightClick(cb: (id: string) => void): void
}
```

Como fazer (foliate-js, só via API pública; não editar o vendor):
- **Mapa de grifos:** `Map<cfi, {id, color}>` e o inverso por id. Guarde em cache o índice da seção de cada CFI (`view.resolveCFI(cfi).index`, em try/catch).
- **Desenho:** em `view.addEventListener('draw-annotation', e => …)`, procure `e.detail.annotation.value` no mapa e chame `e.detail.draw(Overlayer.highlight, { color: COLOR_HEX[color] })`.
- **Seção recém-carregada:** em `view.addEventListener('create-overlay', e => …)`, chame `view.addAnnotation({ value: cfi })` para cada CFI da seção `e.detail.index`. Faça a chamada direto no handler (como o `reader.js` do foliate): o `addAnnotation` é assíncrono e só procura o overlayer depois que o paginator o anexou.
- **`setHighlights`** compara com o mapa atual:
  - CFI removido: `view.deleteAnnotation({ value })`
  - novo ou com a cor mudada: `view.addAnnotation({ value })` (ele mesmo remove e redesenha)
  - toda promessa com `.catch(() => {})`: um CFI inválido faz o `resolveNavigation` do foliate devolver `undefined`, e o `addAnnotation` rejeita
  - com `supportsHighlights` falso, é no-op
- **Clique:** em `view.addEventListener('show-annotation', e => …)`, traduza `e.detail.value` para o id e chame os callbacks de `onHighlightClick`.
- **Seleção:** no handler de `load` que já existe (`event.detail` traz `{doc, index}`), registre `selectionchange` e `pointerup` em `doc` com debounce de 250 ms. Depois do debounce:
  - Com `doc.getSelection()` vazia, colapsada ou com `cleanText(sel.toString()) === ''`, emita `null`, só se a última emissão não foi `null`.
  - Senão, emita:
    - `location: view.getCFI(index, range)`
    - `text: cleanText(sel.toString())`
    - `label: view.getProgressOf(index, range)?.tocItem?.label` normalizado com `normalizeName`, ou `''`
    - `rects: null`
- **`clearSelection`:** `view.deselect()` em try/catch.
- **`goTo`:**
  - Com `strict` e `resolve()` devolvendo `null`, devolve `false` sem navegar.
  - Com sucesso, devolve `true`.
  - O caminho sem `strict` continua o da v1, devolvendo `false` quando cai no início.
- **`destroy`:** remova os listeners novos, limpe os mapas e esvazie os callbacks.

- [ ] **Passo 1:** implementar.
- [ ] **Passo 2: verificação no navegador.** Crie a página temporária `public/dev-grifos.html` (input de arquivo e `<div id="area">` de 800×600) e o módulo `public/dev-grifos.js`, que:
  - abre o arquivo com `openFoliateReader`
  - chama `goTo(null)`
  - expõe `window.r` (o leitor), `window.sel` (a última seleção) e `window.clicks` (os ids clicados)

  Com `fixtures/amostra.epub`, confira:
  - `r.supportsHighlights === true`
  - arrastar o mouse (`left_click_drag`) sobre "leitor curioso" no capítulo 1 preenche `sel` com `location` começando por `epubcfi(`, `text` "leitor curioso" e `rects` null
  - `r.setHighlights([{id:'h1', location: sel.location, rects:null, color:'amarelo'}])` mostra o trecho em amarelo (screenshot)
  - trocar para `color:'verde'` redesenha em verde
  - `r.next()` e depois `r.goTo(sel.location)` mostram o grifo de novo (create-overlay)
  - `r.setFontSize(28)` deixa o grifo ainda sobre o mesmo trecho
  - clicar no grifo põe `'h1'` em `clicks`
  - `r.setHighlights([])` remove o desenho
  - `await r.goTo('epubcfi(/99!/4)', {strict:true}) === false` e a página não muda
  - `await r.goTo(sel.location, {strict:true}) === true`
  - `r.clearSelection()` limpa a seleção e emite `null`

  Com `fixtures/amostra.cbz`, `r.supportsHighlights === false` e `setHighlights([...])` não lança erro.

  O console não deve ter erros, exceto o `console.error` "Could not resolve target" do próprio foliate no teste do CFI inválido.
- [ ] **Passo 3:** apagar `public/dev-grifos.html` e `public/dev-grifos.js`.
- [ ] **Passo 4:** commit `feat: seleção e desenho de grifos no leitor foliate`.

### Tarefa 6: Grifos no leitor de PDF

**Arquivos:** Modificar `public/js/reader-pdf.js`, `public/styles.css` · Verificação: `public/dev-grifos.html` e `public/dev-grifos.js`, temporários

**Interfaces:**
- Consome: os acréscimos da interface `Reader` (Tarefa 5); `COLOR_HEX`, `cleanText`, `normalizeRects` e `hitTest` (Tarefa 2); `toPdfLocation` (v1).
- Produz: os mesmos acréscimos em `openPdfReader`, com `supportsHighlights = true`.

Como fazer:
- **Camada de grifos:** a cada render, crie `const marksEl = <div class="pdf-grifos">` e troque para `pageEl.replaceChildren(canvas, marksEl, textEl)`. A camada de texto fica por cima, então a seleção continua funcionando.
  - CSS: `.pdf-grifos { position:absolute; inset:0; pointer-events:none }` e `.pdf-grifo { position:absolute; opacity:0.35; border-radius:2px }`.
  - O tema escuro não inverte a camada de grifos (o filtro fica só no canvas).
- **Desenho:** para cada grifo da página atual (página tirada de `location` por `/^pdf:(\d+)$/`), crie um `.pdf-grifo` por retângulo, com `left/top/width/height` em `%` (`x*100%` etc.) e `background` igual a `COLOR_HEX[color]`, aplicados via `element.style` (CSSOM; não precisa de `'unsafe-inline'`).
  - `setHighlights` guarda a lista e redesenha só `marksEl`, sem re-renderizar a página.
- **Seleção:** `document.addEventListener('selectionchange', …)` e `textEl` `pointerup`, com debounce de 250 ms.
  - Só conta a seleção cujo `range.commonAncestorContainer` está dentro da `textEl` atual.
  - `rects = normalizeRects(range.getClientRects(), pageEl.getBoundingClientRect())`.
  - Sem rects ou sem texto, emite `null` (com a mesma regra de não repetir `null`).
  - Senão, emite `{ location: toPdfLocation(current), text: cleanText(sel.toString()), label: 'Página ' + current, rects }`.
- **Clique:** `textEl` `click`.
  - Ignore se `getSelection()` não estiver colapsada.
  - Converta `clientX/clientY` em frações de `pageEl.getBoundingClientRect()`.
  - Percorra os grifos da página do último para o primeiro e emita o id do primeiro com `hitTest` verdadeiro.
- **`clearSelection`:** `getSelection().removeAllRanges()` se a seleção estiver dentro da `textEl`.
- **`goTo(location, {strict})`:**
  - Com `strict`, aceita só `/^pdf:(\d+)$/` com página entre 1 e `numPages`. Senão devolve `false` sem navegar.
  - Devolve `true` depois do `showPage`.
  - Sem `strict`, mantém a v1 (`parsePdfLocation`), devolvendo `true`.
- **`destroy`:** remove o listener de `selectionchange` do `document` e limpa os callbacks.

- [ ] **Passo 1:** implementar.
- [ ] **Passo 2: verificação no navegador.** Recrie a página temporária da Tarefa 5, agora com `openPdfReader`. Com `fixtures/amostra.pdf`, confira:
  - arrastar sobre "Página 1" preenche `sel` com `location 'pdf:1'`, `text 'Página 1'`, `label 'Página 1'` e 1 retângulo com `0 < x < 1`
  - `r.setHighlights([{id:'p1', location:'pdf:1', rects: sel.rects, color:'amarelo'}])` desenha a caixa exatamente sobre o texto (screenshot)
  - `r.setZoom(2)` e `r.setZoom('largura')` mantêm a caixa sobre o texto
  - `r.setTheme('escuro')` mantém a caixa visível
  - `r.next()` vai para a página 2, sem caixa
  - `r.prev()` mostra a caixa de novo
  - clicar na caixa põe `'p1'` em `clicks`
  - a seleção continua funcionando por cima do grifo
  - `await r.goTo('pdf:99', {strict:true}) === false` e continua na página 1
  - `await r.goTo('pdf:99')` vai para a página 3 (v1)
  - o console não mostra erros
- [ ] **Passo 3:** apagar os arquivos temporários.
- [ ] **Passo 4:** commit `feat: seleção e desenho de grifos no leitor de PDF`.

### Tarefa 7: Tela de leitura — barra de grifo, nota, painel Grifos e exportação

**Arquivos:** Modificar `public/js/reader-view.js`, `public/styles.css`

**Interfaces:**
- Consome:
  - `library.addHighlight`, `listHighlights`, `updateHighlight` e `removeHighlight` (Tarefa 3)
  - `HIGHLIGHT_COLORS`, `COLOR_HEX`, `COLOR_LABELS` e `DEFAULT_COLOR` (Tarefa 2)
  - `toMarkdown` e `markdownFileName` (Tarefa 4)
  - os acréscimos da interface `Reader` (Tarefas 5 e 6)
  - `formatDate` e `showToast` (v1)
- Produz: `mountReaderView` com a mesma assinatura da v1.

Comportamento e textos exatos:
- **Botão na barra superior:** `iconButton('✎', 'Grifos', 'Grifos')`, entre "Marcadores" e "Aparência". Depois de abrir o leitor, use `hidden = !reader.supportsHighlights`. Sem suporte, não há barra de grifo nem painel.
- **Carga inicial:**
  - `let highlights = await library.listHighlights(id)` (em caso de erro, `[]`)
  - `reader.setHighlights(highlights)`
  - toda mudança atualiza `highlights`, chama `reader.setHighlights(highlights)` e, se o painel Grifos estiver aberto, re-renderiza o painel
- **Barra de grifo:** `<div class="grifo-barra" role="toolbar" hidden>`, inserida entre `.leitor-corpo` e `.leitor-rodape`. Tem dois modos:
  - **Seleção** (`aria-label="Grifar trecho"`), que aparece em `reader.onSelect(sel)` com `sel` não nulo:
    - 4 botões de cor `.grifo-cor`, com fundo `COLOR_HEX` via `style` e `aria-label` `Grifar em amarelo|verde|azul|rosa`
    - `Anotar`
    - `Cancelar`
    - `onSelect(null)` esconde a barra se ela estiver no modo seleção
  - **Edição** (`aria-label="Grifo selecionado"`), que aparece em `reader.onHighlightClick(id)`:
    - 4 botões de cor, com `aria-label` `Mudar para amarelo|…` e `aria-pressed` na cor atual
    - `Nota` (sem nota) ou `Editar nota` (com nota)
    - `Apagar`
    - `Fechar`
- **Grifar** (cor no modo seleção):
  - `library.addHighlight(id, { ...sel, color })`
  - troca o item na lista local se `existing`
  - guarda a cor como última usada (só na sessão)
  - chama `reader.clearSelection()` e esconde a barra
  - em caso de erro, `showToast('Não foi possível salvar o grifo.')` e nada é desenhado
- **Anotar:** grifa na última cor usada (`DEFAULT_COLOR` na primeira vez) e abre o diálogo de nota desse grifo.
- **Cancelar:** `reader.clearSelection()` e esconde a barra.
- **Trocar cor** (modo edição): `library.updateHighlight(id, {color})` e atualiza o `aria-pressed`.
- **Apagar:**
  - se o grifo tem nota e `!confirm('Apagar este grifo e a nota?')`, não faz nada
  - senão, `library.removeHighlight` e esconde a barra
  - em caso de erro, `showToast('Não foi possível apagar o grifo.')` e o grifo continua
- **Diálogo de nota:** um `<dialog class="nota-dialogo">` criado uma vez dentro do `.leitor`, com:
  - `<h2>Nota</h2>`
  - `<p class="nota-trecho">` com o trecho (CSS: 3 linhas com `line-clamp`)
  - `<textarea maxlength="2000">`, com `aria-label="Texto da nota"` e `placeholder="Escreva sua nota"`, preenchido com a nota atual
  - `Salvar` (submit) e `Cancelar` (`type=button`)

  Regras do diálogo:
  - O formulário trata `submit` com `preventDefault()` e fecha o diálogo à mão (como a busca da v1; não use `method="dialog"`, por causa do `form-action 'none'`).
  - Salvar chama `library.updateHighlight(id, {note})`. Em caso de erro, `showToast('Não foi possível salvar a nota.')` e o diálogo fica aberto.
  - Abre com `showModal()` e põe o foco no textarea.
- **Painel Grifos:** `registerPanel('highlights', hlBtn, 'Grifos', render)`.
  - Conteúdo: `<h2>Grifos</h2>`, o botão `Exportar notas (.md)` (`disabled` com a lista vazia) e `<ul class="leitor-lista">`.
  - Lista vazia: `<li class="leitor-status">` com "Nenhum grifo ainda. Selecione um trecho do livro para grifar."
  - Cada item (`li.grifo-item`) tem um botão `.leitor-item` com:
    - `span.grifo-marca` (amostra da cor, `aria-hidden`)
    - `span.grifo-rotulo` (label)
    - `span.grifo-trecho` (texto, 3 linhas)
    - `p.grifo-nota` (só se houver nota)
    - `small` com `formatDate(createdAt)`
  - Depois do botão vêm `Adicionar nota`/`Editar nota` e `Apagar` (`aria-label="Apagar grifo"`).
  - Clicar no item:
    - `const ok = await reader.goTo(h.location, {strict:true})`
    - se `!ok`, `showToast('Não foi possível localizar este grifo no livro.')`
    - em telas ≤ 700px, fecha o painel (como a busca)
- **Exportar:**
  - `toMarkdown(book, highlights, {date: formatDate(Date.now())})`
  - `Blob` com `type: 'text/markdown;charset=utf-8'` e `<a download=markdownFileName(book.title)>`
  - `click()`, depois `URL.revokeObjectURL` após 1 s
  - em caso de erro, `showToast('Não foi possível exportar as notas.')`
- **Teclado:**
  - `onKeyDown` retorna cedo se o diálogo estiver aberto
  - Esc fecha, nesta ordem: diálogo (nativo), painel, barra de grifo e, por último, a tela de leitura
- **Layout:**
  - A barra cabe em 360px: os botões de cor têm 36×36 px e `flex-wrap` está ligado.
  - Funciona nos três temas.
  - Não há rolagem horizontal no celular.

- [ ] **Passo 1:** implementar.
- [ ] **Passo 2: verificação no navegador** (preview `leitor`, com `amostra.epub` e `amostra.pdf` importados). Confira:
  - **ePub:** selecionar "girassol" no capítulo 2 mostra a barra de seleção; Amarelo grifa e a barra some.
  - Recarregar a página e reabrir o livro mostra o grifo no lugar.
  - Clicar no grifo abre o modo edição; Verde troca a cor.
  - Nota abre o diálogo; "Rever" + Salvar fecha.
  - O painel Grifos mostra 1 item com rótulo, trecho, nota e data.
  - Voltar ao capítulo 1 e tocar no item do painel leva ao capítulo 2.
  - **Duplicado:** selecionar o mesmo trecho e escolher Azul mantém 1 item, agora azul.
  - **Exportar notas (.md):** confira o download com `read_network_requests` ou o nome do arquivo; leia o conteúdo gerado pela função no console. O resultado bate com o formato da Tarefa 4.
  - Apagar com nota pede confirmação; aceitar remove o item e o desenho.
  - **PDF:** selecionar "Página 1", Rosa. O painel mostra o rótulo "Página 1". O zoom mantém o desenho.
  - Apagar um grifo sem nota não pede confirmação.
  - **CBZ:** sem o botão Grifos.
  - **Livro removido:** remover o ePub na biblioteca e conferir no console que `getAll('highlights')` não tem mais grifos dele.
  - **Esc:** com a barra aberta, Esc a fecha e o livro continua aberto.
  - **Mobile** (`resize_window` mobile): a barra superior e a barra de grifo cabem, sem rolagem horizontal.
  - **Tema escuro:** grifos legíveis.
  - **Console:** sem erros nem violações de CSP.
- [ ] **Passo 3:** commit `feat: barra de grifo, notas e painel de grifos na leitura`.

### Tarefa 8: Servidor de desenvolvimento — manifest e subcaminho

**Arquivos:** Modificar `server.js`, `.claude/launch.json` · Teste `test/server.test.js`

**Interfaces:**
- Produz:
  - `mimeFor('a.webmanifest') === 'application/manifest+json; charset=utf-8'`
  - `stripBase(pathname: string, base: string): string | null`: remove o prefixo `base` (que sempre termina em `/`) e devolve o caminho começando com `/`, ou `null` se o caminho estiver fora de `base`
  - `createAppServer({ base = '/' } = {})`:
    - fora de `base`, responde 404
    - pedido exatamente igual a `base` sem a barra final (`/Leiturinha`) recebe `301` para `base`
    - `/fixtures/` continua sendo servido de `fixtures/` (depois de remover a base)
  - linha de comando: `node server.js --base=/Leiturinha/ --port=5175` (`parseArgs` de `node:util`); os padrões continuam `/` e `PORT || 5174`
- `.claude/launch.json` ganha a configuração `leitor-pages`: `node server.js --base=/Leiturinha/ --port=5175`, porta 5175 e `"url": "http://localhost:5175"`.

- [ ] **Passo 1: testes que falham.**
  - `mimeFor('m.webmanifest')`.
  - `stripBase('/Leiturinha/js/app.js', '/Leiturinha/') === '/js/app.js'`.
  - `stripBase('/Leiturinha/', '/Leiturinha/') === '/'`.
  - `stripBase('/js/app.js', '/Leiturinha/') === null`.
  - `stripBase('/x', '/') === '/x'`.
  - `stripBase('/LeiturinhaX/a', '/Leiturinha/') === null`.
- [ ] **Passo 2:** FALHAR.
- [ ] **Passo 3:** implementar.
- [ ] **Passo 4:** PASSAR.
- [ ] **Passo 5:** com o preview `leitor-pages`, confira:
  - `http://localhost:5175/Leiturinha/` abre o app
  - `http://localhost:5175/` dá 404
  - `http://localhost:5175/Leiturinha` redireciona para a URL com barra final
- [ ] **Passo 6:** commit `chore: servidor de dev com manifest e subcaminho`.

### Tarefa 9: Ícones, manifest e CSP

**Arquivos:**
- Criar:
  - `tools/png.js`, `tools/make-icons.js`
  - `public/manifest.webmanifest`
  - `public/icons/icon.svg`, `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/icon-maskable-512.png`, `public/icons/apple-touch-icon.png` (180×180)
- Modificar: `public/index.html`, `public/_headers`, `firebase.json`, `package.json` (script `"icons": "node tools/make-icons.js"`)
- Teste: `test/png.test.js`, `test/manifest.test.js`, `test/csp.test.js`

**Interfaces:**
- Produz:

```
// tools/png.js
encodePng(width: number, height: number, rgba: Uint8Array): Uint8Array
// PNG RGBA 8 bits, filtro 0 em todas as linhas, um IDAT com deflateSync (node:zlib) e crc32 de tools/zip.js

// tools/make-icons.js
ICON_SVG: string                                       // mesmo desenho, viewBox "0 0 512 512"
renderIcon(size: number, { maskable = false } = {}): Uint8Array   // RGBA size*size*4
// node tools/make-icons.js grava os 5 arquivos de public/icons/
```

Desenho (coordenadas de 0 a 512, escaladas para `size`, com supersampling 4×4 para suavizar):
- **Fundo `#2b6cb0`:** quadrado com cantos arredondados de raio 96 (fora dele, transparente). No `maskable`, o fundo ocupa o quadrado inteiro, sem arredondar.
- **Livro aberto branco `#ffffff`:**
  - página esquerda: polígono `(112,160) (248,184) (248,368) (112,344)`
  - página direita: polígono `(264,184) (400,160) (400,344) (264,368)`
  - o livro cabe na zona segura do maskable (raio de 40% a partir do centro)

`manifest.webmanifest`:

```json
{
  "name": "Leitor",
  "short_name": "Leitor",
  "description": "Leitor de PDF e ebooks. Os livros ficam só no seu aparelho.",
  "lang": "pt-BR",
  "dir": "ltr",
  "id": "./",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#2b6cb0",
  "icons": [
    { "src": "icons/icon.svg", "sizes": "any", "type": "image/svg+xml" },
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

`index.html` (`<head>`, depois do viewport):

```html
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icons/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<meta name="theme-color" content="#2b6cb0">
```

**CSP:** acrescente `manifest-src 'self'` logo depois de `worker-src 'self' blob:` nas três cópias. Nada mais muda. O registro do SW já é coberto por `worker-src 'self'`.

- [ ] **Passo 1: testes que falham.**
  - **png:**
    - `encodePng(1,1,Uint8Array.of(255,0,0,255))` começa com `89 50 4E 47 0D 0A 1A 0A`
    - o IHDR tem largura 1, altura 1, profundidade 8 e tipo de cor 6
    - o `inflateSync` do IDAT dá `[0,255,0,0,255]`
    - o CRC de cada chunk confere
  - **renderIcon(64):**
    - tem comprimento `64*64*4`
    - o pixel (0,0) tem alfa 0 e, no `maskable`, alfa 255
    - o pixel do centro da página esquerda (≈ (22,32)) é branco
    - o pixel (32,8) é azul (fundo)
  - **manifest:**
    - o JSON lê sem erro e os campos são iguais aos do bloco acima
    - todo `src` é relativo (não começa com `/` nem com `http`) e o arquivo existe em `public/`
    - cada PNG tem no IHDR o tamanho declarado em `sizes`
    - existe um ícone com `purpose` `maskable`
    - `apple-touch-icon.png` tem 180×180
    - `index.html` contém os 4 elementos do `<head>`
  - **csp:** extraia a política da meta de `index.html`, de `_headers` (linha `Content-Security-Policy:`) e de `firebase.json` e quebre cada uma em `diretiva → fontes`. Confira:
    - `_headers` e `firebase.json` são iguais
    - a meta é igual a elas sem `frame-ancestors`
    - nenhuma fonte é `'unsafe-eval'` nem `*`, nenhuma começa com `http:` ou `https:` e nenhuma contém `//`
    - `script-src` é exatamente `["'self'"]`
    - `manifest-src` é `["'self'"]`
    - `worker-src` contém `'self'`
- [ ] **Passo 2:** FALHAR.
- [ ] **Passo 3:** implementar `png.js` e `make-icons.js`, rodar `node tools/make-icons.js` e criar o manifest. Alterar `index.html` e as três CSPs.
- [ ] **Passo 4:** PASSAR.
- [ ] **Passo 5:** no preview `leitor`, confira:
  - `fetch('manifest.webmanifest')` responde com `content-type` `application/manifest+json`
  - o favicon SVG aparece
  - abra os PNGs (screenshot) e confira o livro branco sobre o azul
  - o console não tem violação de CSP
- [ ] **Passo 6:** commit `feat: manifest, ícones e manifest-src na CSP`.

### Tarefa 10: Lista de precache e versão do cache

**Arquivos:**
- Criar: `tools/precache.js`, `public/sw-manifest.js` (gerado)
- Modificar: `package.json` (script `"precache": "node tools/precache.js"`)
- Teste: `test/precache.test.js`

**Interfaces:**
- Produz:

```
// tools/precache.js
export const PUBLIC_DIR: string                          // <raiz>/public
export function selectPrecache(paths: string[]): string[] // pura; caminhos POSIX relativos a public/; saída ordenada
export function cacheVersion(files: { path: string, bytes: Uint8Array }[]): string
// 'leitor-' + 12 primeiros hex do SHA-256 (node:crypto) de, para cada arquivo em ordem de path:
// path + '\n' + bytes normalizados + '\n'. Normalização: nos arquivos de texto (.html .css .js .mjs
// .json .webmanifest .svg .txt), '\r\n' vira '\n'; binários entram como estão.
export function renderManifest(paths: string[], version: string): string
export function buildManifest(publicDir = PUBLIC_DIR): string   // lista o disco, seleciona, calcula a versão e renderiza
// node tools/precache.js grava public/sw-manifest.js (com '\n')
```

Regras de `selectPrecache`:
- **Inclui:**
  - `index.html`, `styles.css`, `manifest.webmanifest`
  - `icons/*`
  - `js/*.js`
  - `vendor/pdfjs/build/*.mjs`, `vendor/pdfjs/cmaps/*`, `vendor/pdfjs/standard_fonts/*`
  - `vendor/foliate-js/*.js`
  - `vendor/foliate-js/vendor/zip.js`, `vendor/foliate-js/vendor/fflate.js`
- **Exclui, mesmo que caia numa inclusão:**
  - `*.map`
  - nomes que começam com `LICENSE`
  - `README.md`, `_headers`, `sw.js`, `sw-manifest.js`, `dev-*`
  - `vendor/foliate-js/vendor/pdfjs/**` (12,7 MB que o app não usa: os PDFs vão para o pdf.js próprio)
  - `vendor/foliate-js/eslint.config.js`, `vendor/foliate-js/rollup.config.js`, `vendor/foliate-js/reader.js` (demo que importa `ui/`, que não foi copiado) e `vendor/foliate-js/pdf.js` (importa o pdf.js do foliate, excluído)

Formato de `sw-manifest.js`:

```js
// Gerado por tools/precache.js. Não edite à mão: rode `node tools/precache.js`.
self.LEITOR_CACHE = 'leitor-0123456789ab';
self.LEITOR_PRECACHE = [
  'icons/apple-touch-icon.png',
  'index.html',
  …
];
```

- [ ] **Passo 1: testes que falham.**
  - `selectPrecache` sobre uma lista montada no teste:
    - inclui `index.html`, `js/app.js`, `vendor/pdfjs/build/pdf.worker.min.mjs`, `vendor/pdfjs/cmaps/H.bcmap`, `vendor/foliate-js/paginator.js` e `vendor/foliate-js/vendor/zip.js`
    - exclui `vendor/foliate-js/vendor/pdfjs/pdf.mjs`, `vendor/foliate-js/vendor/pdfjs/pdf.mjs.map`, `vendor/pdfjs/LICENSE`, `vendor/pdfjs/standard_fonts/LICENSE_FOXIT`, `vendor/README.md`, `_headers`, `sw.js`, `sw-manifest.js`, `dev-grifos.html`, `vendor/foliate-js/reader.js` e `vendor/foliate-js/pdf.js`
    - a saída sai ordenada
  - `cacheVersion`:
    - casa com `/^leitor-[0-9a-f]{12}$/`
    - dá o mesmo valor para `{path:'a.js', bytes:'x\r\ny'}` e `{…'x\ny'}`
    - para `.png`, CRLF e LF dão valores diferentes
    - muda se 1 byte muda ou se um path é renomeado
  - `renderManifest(['a.js'], 'leitor-000000000000')`, rodado em `node:vm` com `{ self: {} }`, dá `LEITOR_PRECACHE` `['a.js']` e `LEITOR_CACHE` correto.
  - **Manifesto em dia:** `readFileSync('public/sw-manifest.js','utf8').replace(/\r\n/g,'\n') === buildManifest()`. Se falhar, a mensagem é `public/sw-manifest.js desatualizado: rode node tools/precache.js`.
  - Todo caminho de `LEITOR_PRECACHE` existe em `public/`.
  - O tamanho total da lista fica abaixo de 6 MB (protege contra a inclusão acidental do pdf.js do foliate).
- [ ] **Passo 2:** FALHAR.
- [ ] **Passo 3:** implementar e rodar `node tools/precache.js`.
- [ ] **Passo 4:** PASSAR. Anote no relatório o número de arquivos e o total em MB.
- [ ] **Passo 5:** commit `feat: lista de precache e versão do cache por conteúdo`.

### Tarefa 11: Service worker

**Arquivos:** Criar `public/sw.js` · Modificar `public/_headers`, `firebase.json` · Teste `test/sw.test.js`

**Interfaces:**
- Consome: `self.LEITOR_CACHE` e `self.LEITOR_PRECACHE` (Tarefa 10), via `importScripts('sw-manifest.js')`.
- Produz: o service worker clássico, com esta função no topo do arquivo (sem DOM, testável):

```
function planFetch(
  request: { url: string, method: string, mode: string },
  scope: string,                 // self.registration.scope, ex.: 'https://x.github.io/Leiturinha/'
  precache: Set<string>,
): { kind: 'cache', path: string } | { kind: 'index' } | { kind: 'pass' }
```

Regras de `planFetch`, em ordem:
1. `method !== 'GET'` → `pass`.
2. Origem da URL diferente da origem do escopo → `pass`.
3. `pathname` fora do caminho do escopo → `pass`.
4. `mode === 'navigate'` → `index`.
5. `path` = `decodeURIComponent` do `pathname` sem o prefixo do escopo (a query é ignorada). Se `precache.has(path)` → `cache`; senão → `pass`.

Eventos:
- **`install`:** `caches.open(LEITOR_CACHE)` e `cache.addAll(LEITOR_PRECACHE.map(p => new Request(new URL(p, scope), { cache: 'reload' })))`. Qualquer falha faz o install falhar. **Sem `skipWaiting()`.**
- **`activate`:** apaga todo cache cujo nome começa com `leitor-` e é diferente de `LEITOR_CACHE`, depois chama `self.clients.claim()`.
- **`fetch`:** usa `planFetch`.
  - `cache` → `respondWith`: resposta de `cache.match(new URL(path, scope))`, ou `fetch(event.request)` se faltar.
  - `index` → `respondWith`: resposta de `cache.match(new URL('index.html', scope))`, ou `fetch(event.request)`.
  - `pass` → não chama `respondWith`.
- **`message`:** `event.data?.type === 'ativar'` → `self.skipWaiting()`.

Cabeçalhos: em `_headers`, acrescente:

```
/sw.js
  Cache-Control: no-cache

/sw-manifest.js
  Cache-Control: no-cache
```

Em `firebase.json`, acrescente regras equivalentes com `source` `/sw.js` e `/sw-manifest.js`.

- [ ] **Passo 1: testes que falham.** Carregue `public/sw-manifest.js` e `public/sw.js` com `node:vm` num contexto com stubs:
  - `self = { addEventListener(){}, registration: { scope } }`
  - `importScripts(name)`, que roda o arquivo de `public/` no mesmo contexto
  - `caches = {}`, `URL` e `Request`

  Leia `planFetch` do contexto. Com `scope = 'https://x.github.io/Leiturinha/'` e `precache` vindo de `LEITOR_PRECACHE`:
  - navegação para `https://x.github.io/Leiturinha/?sw#/ler/abc` → `index`
  - GET `https://x.github.io/Leiturinha/js/app.js` → `cache 'js/app.js'`
  - com `?v=2` no fim → `cache 'js/app.js'`
  - `https://x.github.io/Leiturinha/vendor/pdfjs/cmaps/H.bcmap` → `cache`
  - `https://x.github.io/Leiturinha/vendor/foliate-js/vendor/pdfjs/pdf.mjs` → `pass`
  - `https://x.github.io/Outro/js/app.js` → `pass`
  - `https://cdn.example.com/x.js` → `pass`
  - POST na URL do app → `pass`

  Com escopo na raiz `https://leitor.web.app/`, `https://leitor.web.app/index.html` → `cache 'index.html'`.

  Ativação só por mensagem: o texto de `sw.js` contém `skipWaiting` exatamente uma vez (no handler de `message`).
- [ ] **Passo 2:** FALHAR.
- [ ] **Passo 3:** implementar. Rodar `node tools/precache.js` (o `sw.js` não entra na lista, mas `_headers` e outros arquivos podem ter mudado).
- [ ] **Passo 4:** PASSAR.
- [ ] **Passo 5:** commit `feat: service worker com cache por versão`.

### Tarefa 12: Registro, aviso de atualização e espaço usado

**Arquivos:**
- Criar: `public/js/sw-mode.js`, `public/js/pwa.js`
- Modificar: `public/js/app.js`, `public/js/idb-store.js`
- Teste: `test/sw-mode.test.js`, `test/store.test.js`

**Interfaces:**
- Consome: `showBanner`/`hideBanner` (Tarefa 1) e `public/sw.js` (Tarefa 11).
- Produz:

```
// sw-mode.js (puro)
serviceWorkerMode(url: string | URL): 'register' | 'unregister' | 'skip'
// https: → 'register'
// http: em localhost, 127.0.0.1, [::1] ou *.localhost → 'register' com o parâmetro ?sw; senão 'unregister'
// qualquer outro caso → 'skip'

// pwa.js (DOM)
setupPwa({ beforeReload }: { beforeReload: () => Promise<unknown> }): void

// idb-store.js
export function usedBytesOf(estimate: { usage?: number, usageDetails?: { indexedDB?: number } }): number
// usageDetails.indexedDB, se existir; senão usage; senão 0. usage() passa a usar esta função.
```

`setupPwa`:
1. Sem `'serviceWorker' in navigator`, não faz nada.
2. Com `unregister`, chama `getRegistrations()` e `unregister()` em cada um (com catch) e para.
3. Com `skip`, para.
4. Guarda `hadController = !!navigator.serviceWorker.controller` e `userAsked = false`.
5. Em `controllerchange`:
   - se `userAsked`, `location.reload()`
   - senão, se `hadController`, `showBanner({ text: 'O Leitor foi atualizado em outra aba. Recarregue esta página.', actionLabel: 'Recarregar', onAction: () => location.reload() })`
   - sem controlador antes (primeira instalação, via `clients.claim`), não faz nada
6. Registra: `navigator.serviceWorker.register(new URL('../sw.js', import.meta.url), { scope: new URL('../', import.meta.url).href, updateViaCache: 'none' })`. Em caso de erro, `console.warn` e o app segue.
7. Oferece a atualização com `offer(worker)`:
   - `showBanner({ text: 'Nova versão disponível.', actionLabel: 'Atualizar', onAction })`
   - `onAction`: `userAsked = true`, `await beforeReload()` (com catch) e `worker.postMessage({ type: 'ativar' })`

   `offer` é chamada:
   - logo após o registro, se `reg.waiting && navigator.serviceWorker.controller`
   - em `updatefound`, quando o `reg.installing` chega a `state === 'installed'` com `navigator.serviceWorker.controller` presente
8. Em `visibilitychange` para visível, chama `reg.update()` se a última checagem foi há mais de 1 hora (com catch).

Em `app.js`: `setupPwa({ beforeReload: () => closeReader() })`, chamado depois do primeiro `render()`. `closeReader` já devolve a promessa do salvamento de progresso, e o hash continua `#/ler/<id>`, então o recarregamento reabre o livro no mesmo ponto.

- [ ] **Passo 1: testes que falham.**
  - `serviceWorkerMode`:
    - `'https://brayanfragadev.github.io/Leiturinha/'` → `register`
    - `'http://localhost:5174/'` → `unregister`
    - `'http://localhost:5174/?sw'` → `register`
    - `'http://127.0.0.1:5174/?sw#/ler/x'` → `register`
    - `'http://192.168.0.10:5174/?sw'` → `skip`
    - `'file:///C:/x/index.html'` → `skip`
  - `usedBytesOf`:
    - `{usage: 5e6, usageDetails: {indexedDB: 1000}}` → `1000`
    - `{usage: 5e6}` → `5e6`
    - `{}` → `0`
- [ ] **Passo 2:** FALHAR.
- [ ] **Passo 3:** implementar e rodar `node tools/precache.js`.
- [ ] **Passo 4:** PASSAR.
- [ ] **Passo 5: verificação no navegador** (preview `leitor`):
  1. **Sem `?sw`:** `await navigator.serviceWorker.getRegistrations()` dá `[]`.
  2. **Com `?sw`:** abra `http://localhost:5174/?sw` e espere a instalação. Confira:
     - `navigator.serviceWorker.controller` não é nulo
     - `await caches.keys()` dá `[self.LEITOR_CACHE]`, o valor de `public/sw-manifest.js`
     - `(await (await caches.open(k)).keys()).length` é igual ao tamanho de `LEITOR_PRECACHE`
     - **não** aparece a faixa de outra aba
  3. **Offline:** com livros importados, `preview_stop` no servidor e recarregue `http://localhost:5174/?sw`. Confira:
     - a biblioteca aparece
     - o PDF abre e vira página
     - o ePub abre, a busca encontra "girassol" e os grifos aparecem
     - `read_console_messages` não tem erro de rede de arquivo do site

     Depois, inicie o preview de novo.
  4. **Atualização:**
     1. Acrescente um comentário em `public/styles.css`, rode `node tools/precache.js` e recarregue. Aparece "Nova versão disponível." com **Atualizar**, e `caches.keys()` ainda tem a versão antiga ativa.
     2. Abra o PDF na página 3 e toque em **Atualizar**. A página recarrega na página 3, e `caches.keys()` só tem a versão nova.
     3. Desfaça o comentário e rode `node tools/precache.js` (mais um ciclo de atualização; aceite).
  5. **Duas abas:** com duas abas em `?sw`, gere uma versão nova (como no item 4) e toque em Atualizar na aba A. A aba B mostra "O Leitor foi atualizado em outra aba. Recarregue esta página."
  6. **Subcaminho:** no preview `leitor-pages`, abra `http://localhost:5175/Leiturinha/?sw`. Confira:
     - `(await navigator.serviceWorker.getRegistration()).scope === 'http://localhost:5175/Leiturinha/'`
     - `new URL(m.start_url, manifestUrl).href === 'http://localhost:5175/Leiturinha/'`, com `m` lido do `link[rel=manifest]`
     - offline (parando `leitor-pages`) o app abre em `/Leiturinha/` e em `/Leiturinha/#/ler/<id>`
  7. **Espaço usado:** com a biblioteca vazia e o SW instalado, "Espaço usado" fica perto de 0 no Chrome, e não em ~4 MB.
  8. **Volta ao dev normal:** abra `http://localhost:5174/` sem `?sw`. O registro é removido (`getRegistrations()` dá `[]` depois de recarregar).
  9. **Console:** sem violações de CSP em todos os passos.
- [ ] **Passo 6:** commit `feat: registro do service worker e aviso de nova versão`.

### Tarefa 13: Documentação e verificação final

**Arquivos:** Modificar `README.md`, `CLAUDE.md` · Remover qualquer `public/dev-*` que tenha sobrado

- [ ] **Passo 1:** README:
  - seção **Grifos e notas**: como grifar, cores, lista, exportação, o que não tem grifo
  - seção **Instalar e usar offline**: menu do navegador, o que fica em cache, aviso de atualização, Safari/iOS via "Adicionar à Tela de Início"
  - em **Privacidade**, dizer que grifos e notas ficam no IndexedDB e que o service worker guarda só os arquivos do site
  - em **Como rodar**, acrescentar `node tools/precache.js` (obrigatório depois de mudar `public/`), `node tools/make-icons.js`, `?sw` para testar o SW em localhost e `node server.js --base=/Leiturinha/ --port=5175`
  - atualizar a árvore de **Estrutura**
- [ ] **Passo 2:** CLAUDE.md:
  - Comandos: `node tools/precache.js` e `node tools/make-icons.js`
  - Estrutura: `schema.js`, `highlights.js`, `notes-export.js`, `banner.js`, `sw-mode.js`, `pwa.js`, `sw.js`, `sw-manifest.js`, `manifest.webmanifest` e `icons/`
  - Convenções:
    - "Depois de alterar `public/`, rode `node tools/precache.js`; o teste falha se esquecer."
    - "Migrações do IndexedDB só acrescentam stores, em `schema.js`."
    - a interface `Reader` inclui os métodos de grifo
    - `manifest-src 'self'` faz parte da CSP
- [ ] **Passo 3:** `npm test` deve passar por completo. `node tools/precache.js` não deve gerar diferença (`git diff --exit-code public/sw-manifest.js`).
- [ ] **Passo 4:** com `read_network_requests`, confirme que não há requisições para fora de `localhost` durante a importação, a leitura, os grifos, a exportação e a instalação do SW.
- [ ] **Passo 5:** commit `docs: README e CLAUDE.md da v2`.
