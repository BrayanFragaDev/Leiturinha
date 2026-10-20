# Leitor v2 — Produto

Data: 2026-10-20 · Status: rascunho para revisão · Base: [produto.md](produto.md) (v1, publicada)

## 1. O que é

A v2 mantém o leitor da v1 (biblioteca local, PDF/ePub/MOBI/FB2/CBZ, retomada da leitura) e acrescenta duas coisas:

1. **Grifos e notas**: a pessoa seleciona um trecho, grifa numa cor, escreve uma nota e depois revê tudo numa lista por livro.
2. **App instalável e offline (PWA)**: o Leitor pode ser instalado na tela inicial e abre sem internet, porque o site fica guardado no aparelho. Quando sai uma versão nova, o app avisa e só atualiza quando a pessoa pede.

**Princípio central (sem mudança):** nada sai do aparelho. Grifos e notas ficam no IndexedDB junto com os livros. O service worker guarda só os arquivos do site, nunca os livros.

## 2. Para quem e para quê

| | |
|---|---|
| Usuário | O mesmo da v1: uma pessoa lendo os próprios arquivos, um usuário por navegador |
| Problema | Na v1 não dá para marcar um trecho nem anotar uma ideia, e o app não abre no celular sem conexão (no metrô, no avião) |
| Sucesso | Grifar uma frase em amarelo, anotar "rever no capítulo 5", fechar o app, abrir dias depois **sem internet** pelo ícone da tela inicial e achar o grifo na lista, com um toque que leva até ele |

> **Premissas (não foram ditas, confirme ou corrija):**
> - O escopo da v2 é só grifos/notas e PWA/offline. Sincronização, backup e TTS continuam fora.
> - **Exportar as notas de um livro em Markdown entra na v2** (ver §4.3 para a justificativa).
> - Quatro cores fixas de grifo: amarelo (padrão), verde, azul e rosa. Sem cores personalizadas.
> - O nome exibido ao instalar é **"Leitor"**, igual ao título da página, e não "Leiturinha" (o nome do repositório).
> - Não haverá botão próprio "Instalar app": a instalação usa o menu do navegador ("Instalar app" / "Adicionar à tela de início").
> - Quadrinhos (CBZ) e ePubs de layout fixo não têm grifos.
> - Em `localhost` o service worker fica desligado por padrão, para não atrapalhar o desenvolvimento (liga com `?sw`).

## 3. Formatos e grifos

| Formato | Grifos | Como o local do grifo é guardado |
|---|---|---|
| PDF (com texto) | Sim | `pdf:<página>` + retângulos normalizados (0–1) relativos à página |
| PDF digitalizado (só imagem) | Não há texto para selecionar | — |
| ePub refluível, MOBI/AZW3, FB2 | Sim | CFI de intervalo do foliate-js (`epubcfi(/6/4!/4/2,/1:0,/1:12)`) |
| ePub de layout fixo | Não | O foliate não cria a camada de desenho (`overlayer`) no layout fixo |
| CBZ | Não | Só imagens |

## 4. Funcionalidades da v2

### 4.1 Grifar e anotar
- Ao selecionar texto no livro (mouse ou toque longo), aparece a **barra de grifo** acima da barra de progresso, com quatro cores, **Anotar** e **Cancelar**.
- Tocar numa cor grifa o trecho e fecha a barra. **Anotar** grifa na última cor usada (amarelo na primeira vez) e abre o editor de nota.
- O grifo aparece desenhado por cima do texto, semitransparente, nos três temas e em qualquer tamanho de fonte ou zoom.
- Tocar num grifo já feito abre a barra em modo de edição: trocar a cor, **Nota** (ou **Editar nota**), **Apagar** e **Fechar**.
- Grifar de novo exatamente o mesmo trecho não duplica: só troca a cor.
- Trechos que se sobrepõem parcialmente são grifos diferentes, desenhados um sobre o outro.
- O editor de nota é um diálogo com um campo de até 2000 caracteres, **Salvar** e **Cancelar**. Salvar uma nota vazia remove a nota, mas mantém o grifo.

### 4.2 Lista de grifos
- Novo botão **Grifos** na barra superior (oculto em CBZ e ePub de layout fixo), que abre um painel lateral como Sumário e Marcadores.
- A lista segue a ordem do livro: no PDF, por página e depois de cima para baixo; nos outros formatos, pela ordem do CFI.
- Cada item mostra a cor, o capítulo ou a página, o trecho (até 3 linhas), a nota (se houver) e a data.
- Tocar no item leva ao grifo. Cada item tem também **Adicionar nota**/**Editar nota** e **Apagar**.
- Apagar um grifo **sem nota** é imediato. Com nota, pede confirmação.

### 4.3 Exportar notas (Markdown)
- No painel Grifos, o botão **Exportar notas (.md)** baixa um arquivo `<titulo>-notas.md` com título, autor, data e, agrupados por capítulo/página, cada trecho em citação (`>`) seguido da nota.
- O arquivo é gerado no próprio navegador (Blob + download) e nada é enviado para fora.

**Por que entra na v2:** sem sincronização nem backup, os grifos ficam presos a um navegador. Se a pessoa limpar os dados do site, perde tudo. O Markdown é a saída mais barata. É uma função pura, testável no Node, e o resultado abre em qualquer editor ou no Obsidian/Notion. Custa uma tarefa pequena e não muda a arquitetura. **Importar** o Markdown de volta fica fora (exigiria reencontrar o trecho no livro).

### 4.4 Instalar e usar offline
- O site tem `manifest.webmanifest` com nome, cores e ícones (192, 512, maskable 512, apple-touch 180 e SVG). O navegador oferece a instalação pelo próprio menu.
- Na primeira visita com internet, o service worker guarda todos os arquivos do site (HTML, CSS, JS, pdf.js com worker, cmaps e fontes padrão, módulos do foliate-js que o app usa e ícones), cerca de 4 MB.
- A partir daí o app abre e lê **sem internet**, inclusive nas rotas `#/ler/<id>`.
- Funciona no subcaminho do GitHub Pages (`/Leiturinha/`) e na raiz das outras hospedagens. Todos os caminhos são relativos ao escopo do service worker.

### 4.5 Atualização
- Cada publicação gera uma versão de cache nova, calculada pelo conteúdo dos arquivos.
- Quando o navegador encontra uma versão nova, ela é baixada em segundo plano e aparece a faixa **"Nova versão disponível."** com o botão **Atualizar**. A versão em uso continua funcionando até a pessoa tocar em Atualizar.
- **Atualizar** salva a posição de leitura, ativa a versão nova e recarrega a página no mesmo lugar.
- Caches de versões antigas são apagados quando a nova assume.

## 5. Fora do escopo da v2

- Sincronização, contas, backup na nuvem e importação de notas.
- Grifos em CBZ, em ePub de layout fixo e em PDF digitalizado (sem OCR).
- Busca dentro das notas e filtro por cor.
- Botão próprio "Instalar app" (`beforeinstallprompt`), `file_handlers` (abrir `.epub` pelo sistema) e `share_target`.
- Notificações push e sincronização em segundo plano.
- Guardar os livros no Cache Storage: eles continuam só no IndexedDB.
- TTS, dicionário e os formatos que já estavam fora na v1.

## 6. Comportamento em situações-limite

| Situação | Comportamento esperado |
|---|---|
| Banco da v1 (versão 1) com livros, progresso e marcadores | Ao abrir a v2, o banco sobe para a versão 2 criando só a store `highlights`. Livros, arquivos, progresso e marcadores continuam iguais. |
| Outra aba ainda aberta com a v1 durante a migração | A migração espera, sem cair no modo temporário. Faixa: "Feche as outras abas do Leitor para concluir a atualização." A faixa some quando a migração termina. |
| Esta aba usa o banco e outra aba migra para uma versão mais nova | A conexão é fechada. Faixa: "O Leitor foi atualizado em outra aba. Recarregue esta página." com o botão **Recarregar**. |
| A migração falha (erro ou aborto da transação) | Nada é alterado no banco (a transação de upgrade é atômica). O app abre em modo temporário com a faixa da v1. |
| Remover um livro | Apaga o arquivo, o progresso, os marcadores **e os grifos e notas** dele. A confirmação da v1 continua igual. |
| Grifar exatamente o mesmo trecho de novo | Não duplica. Troca a cor do grifo existente. |
| Seleção vazia ou só com espaços | A barra de grifo não aparece. |
| Trecho grifado muito longo | O grifo cobre o trecho inteiro. O texto guardado para a lista e a exportação é cortado em 5000 caracteres, com "…". |
| Nota com mais de 2000 caracteres | O campo não aceita mais que 2000. |
| Grifo cujo local não é mais encontrado (CFI quebrado) | Continua na lista. Tocar nele mostra "Não foi possível localizar este grifo no livro." e a leitura não sai do lugar. |
| Falha ao gravar o grifo (cota, erro do IndexedDB) | Aviso "Não foi possível salvar o grifo." e nada é desenhado. |
| Falha ao apagar | Aviso "Não foi possível apagar o grifo." e o grifo continua. |
| Modo temporário (sem IndexedDB) | Grifos funcionam na sessão e somem ao fechar, como o resto da biblioteca. |
| Exportar num livro sem grifos | O botão **Exportar notas (.md)** fica desabilitado. |
| Primeira visita sem internet | Não há o que fazer: o navegador mostra o erro de conexão dele. |
| Navegador sem service worker (janela privada de alguns navegadores, `http://<ip>`) | O app funciona online como na v1, sem offline e sem aviso. |
| Falha ao baixar os arquivos do cache na instalação (rede caiu, cota) | O service worker não é instalado e o app segue online. Nova tentativa na próxima visita. |
| Versão nova publicada com o app aberto | Faixa "Nova versão disponível." com **Atualizar**. Nada muda até o toque. |
| Atualizar no meio da leitura | Salva a posição, recarrega e volta ao mesmo ponto do mesmo livro. |
| Duas abas abertas, uma toca em Atualizar | A outra aba mostra "O Leitor foi atualizado em outra aba. Recarregue esta página." com **Recarregar**. |
| App aberto em `localhost` (desenvolvimento) | Sem service worker. Um registro antigo é removido. Com `?sw` na URL, o SW é registrado para teste. |
| "Espaço usado" na biblioteca | Conta só o IndexedDB quando o navegador informa o detalhamento (`usageDetails`). Senão, mostra o total, que inclui os ~4 MB do site. |

## 7. Arquitetura (o que muda)

- **Banco `leitor` versão 2.** Nova object store `highlights` (keyPath `id`). O esquema e as migrações ficam num módulo puro (`schema.js`) usado pelo IndexedDB e pelo armazenamento em memória. As migrações são só aditivas: criam stores e nunca apagam nem reescrevem registros.
- **Regras puras novas**, testadas com `node --test`:
  - `highlights.js`: cores, limpeza de texto e nota, ordenação (usa `compare` de `vendor/foliate-js/epubcfi.js`), retângulos de PDF e teste de clique.
  - `notes-export.js`: Markdown e nome do arquivo.
  - `sw-mode.js`: quando registrar o service worker.
  - `tools/precache.js`: lista de arquivos e versão do cache.
- **`library.js`** ganha `addHighlight`, `listHighlights`, `updateHighlight` e `removeHighlight`, e `remove()` passa a apagar os grifos.
- **Interface `Reader`** ganha `supportsHighlights`, `onSelect`, `clearSelection`, `setHighlights`, `onHighlightClick` e `goTo(loc, {strict})`, que devolve se chegou ao local.
  - Foliate: usa `addAnnotation`/`deleteAnnotation`, os eventos `create-overlay`, `draw-annotation` e `show-annotation` e `Overlayer.highlight`.
  - PDF: uma camada `.pdf-grifos` entre o canvas e a camada de texto do pdf.js.
  - As telas continuam sem chamar pdf.js nem foliate-js.
- **PWA**:
  - `public/manifest.webmanifest` e `public/icons/`, gerados por `tools/make-icons.js` sem dependências (PNG com `node:zlib`).
  - `public/sw.js` é um service worker clássico. Ele carrega `public/sw-manifest.js`, que é gerado por `node tools/precache.js` e versionado no git.
  - `public/js/pwa.js` registra o SW e mostra os avisos de atualização.
  - Um teste falha se `sw-manifest.js` estiver desatualizado. Como o CI roda `npm test` antes de publicar, uma versão de cache velha não chega ao ar.
- **Estratégia do service worker:**
  - **cache-first** para os arquivos da lista.
  - Navegações dentro do escopo recebem o `index.html` do cache.
  - Requisições fora da lista ou de outra origem não são interceptadas.
  - A instalação baixa com `cache: 'reload'` para ignorar o cache HTTP (`/vendor/*` é `immutable` em Netlify/Firebase).
  - Ativação só por mensagem da página (sem `skipWaiting` automático).
- **CSP:** continua sem `'unsafe-eval'` e sem origens remotas.
  - A única mudança é o acréscimo explícito de `manifest-src 'self'`, nas três cópias: meta de `index.html`, `public/_headers` e `firebase.json`.
  - O registro do service worker já é coberto por `worker-src 'self' blob:`.
  - O `fetch` interno do SW é same-origin e respeita `connect-src 'self'`.
  - As respostas servidas do cache mantêm os cabeçalhos originais, inclusive a CSP enviada por Firebase/Netlify.
- **Cabeçalhos:** `sw.js` e `sw-manifest.js` com `Cache-Control: no-cache` em `_headers` e `firebase.json`. O registro usa `updateViaCache: 'none'`.
- **Servidor de desenvolvimento:** passa a servir `.webmanifest` com o tipo certo e aceita `BASE=/Leiturinha/` para simular o subcaminho do GitHub Pages.

## 8. Hospedagem

Sem mudança: qualquer hospedagem estática publicando `public/`, sem comando de build. O único passo novo para quem altera arquivos de `public/` é rodar `node tools/precache.js` antes do commit. O teste avisa se esse passo ficar esquecido.

## 9. Licenças de terceiros

Sem dependências novas. Os ícones são gerados pelo próprio projeto.
