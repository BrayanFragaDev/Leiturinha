# Leitor — Produto

Data: 2026-10-20 · Status: rascunho para revisão

## 1. O que é

Um leitor de livros digitais no navegador, criado como projeto próprio. A pessoa abre arquivos que já tem no computador ou no celular (PDF, ePub e outros formatos de ebook), monta uma biblioteca e lê com conforto. O leitor guarda onde ela parou.

**Princípio central:** os arquivos nunca saem do aparelho. Não há servidor de dados, conta nem upload. Tudo fica no navegador (IndexedDB).

## 2. Para quem e para quê

| | |
|---|---|
| Usuário | Uma pessoa lendo os próprios arquivos (uso pessoal, um usuário por navegador) |
| Problema | PDFs e ebooks espalhados em pastas, leitores diferentes para cada formato e a posição de leitura perdida |
| Sucesso | Arrastar um arquivo para a página, ver o livro na estante com capa e título e, ao reabrir dias depois, continuar exatamente da página onde parou |

> **Premissas (não foram ditas, confirme ou corrija):** é uso pessoal, sem catálogo para terceiros; a interface fica em português; precisa funcionar no desktop e no celular pelo navegador; não há sincronização entre aparelhos na v1.

## 3. Formatos suportados

| Formato | Extensões | Motor |
|---|---|---|
| PDF | `.pdf` | pdf.js (`pdfjs-dist` 4.10.38) |
| ePub 2/3 | `.epub` | foliate-js |
| Kindle sem DRM | `.mobi`, `.azw3`, `.azw` | foliate-js |
| FictionBook | `.fb2`, `.fbz` | foliate-js |
| Quadrinhos | `.cbz` | foliate-js |

O formato é detectado pelo conteúdo (assinatura de bytes) e, na falta dele, pela extensão. Arquivos com DRM, corrompidos ou de outros tipos são recusados com uma mensagem clara e não entram na biblioteca.

## 4. Funcionalidades da v1

### Biblioteca (tela inicial)
- Importar por botão ou arrastando arquivos para a página, vários de uma vez.
- Estante em grade mostrando capa (ou capa gerada com título e cor), título, autor, formato e % lido.
- Ordenar por: **Lidos recentemente** (padrão), **Título** ou **Adicionados recentemente**.
- Filtrar por texto em título ou autor.
- Um arquivo idêntico (mesmo hash SHA-256) não é duplicado. O app avisa "Este livro já está na biblioteca" e abre o existente.
- Remover um livro pede confirmação e apaga arquivo, progresso e marcadores.
- Mostrar o espaço usado.

### Leitura
- Navegação por botões, clique nas bordas, setas ←/→, PageUp/PageDown e espaço. `Esc` volta para a biblioteca.
- Barra inferior com o progresso (% e página ou posição) e um controle deslizante para pular.
- **Sumário** (índice do livro) com navegação.
- **Busca** de texto dentro do livro, com trechos clicáveis.
- **Marcadores**: adicionar, listar com rótulo e data, ir até um e remover.
- **Aparência**: temas Claro, Sépia e Escuro. Nos formatos refluíveis (ePub/MOBI/FB2), tamanho de fonte de 14 a 28 px, de 2 em 2 (padrão 18). No PDF, zoom "ajustar à largura" (padrão) e níveis de 50% a 300%.
- Tela cheia.
- A posição é salva automaticamente (até 1 s depois de virar a página) e o livro reabre nela.

### Preferências
- Tema e tamanho de fonte valem para todos os livros e ficam no `localStorage`.

## 5. Fora do escopo da v1

- Contas, sincronização entre aparelhos e nuvem.
- Remoção de DRM (não será feito).
- Grifos e anotações de texto (candidato para a v2).
- Leitura em voz alta (TTS) e dicionário.
- Instalação como PWA ou uso offline com service worker (candidato para a v2).
- Formatos `.docx`, `.txt`, `.cbr` (RAR) e `.djvu`.

## 6. Comportamento em situações-limite

| Situação | Comportamento esperado |
|---|---|
| IndexedDB indisponível (aba anônima, bloqueio) | O app funciona em modo sessão: dá para ler, mas nada é salvo. Uma faixa avisa: "Modo temporário: a biblioteca não será salva neste navegador." |
| Cota de armazenamento estourada | O livro não é adicionado e aparece a mensagem "Sem espaço no navegador para este arquivo (X MB)." |
| Posição salva inválida (página maior que o total, CFI quebrado) | Abre no início sem erro |
| Link `#/ler/<id>` de um livro inexistente | Volta à biblioteca com "Livro não encontrado." |
| Arquivo de formato errado (por exemplo, `.docx` renomeado para `.pdf`) | É recusado: "Formato não suportado: nome.pdf" |

## 7. Arquitetura

- Site **100% estático** em `public/`, com JavaScript puro em módulos ES, sem etapa de build e sem dependências npm em tempo de execução.
- pdf.js e foliate-js ficam **copiados para `public/vendor/`** em versões fixas. Não há CDN em tempo de execução, então a privacidade e o funcionamento offline são preservados.
- `server.js` (Node ≥ 20, sem dependências) serve só para o desenvolvimento local, na porta **5174**.
- Camadas:
  - `formats` detecta o formato.
  - `store` faz a persistência, com IndexedDB e alternativa em memória.
  - `library` cuida das regras da biblioteca.
  - Os `readers` adaptam pdf.js e foliate-js a **uma interface comum**.
  - As `views` montam a interface.
  - `router` cuida das rotas por hash: `#/` e `#/ler/<id>`.
- As regras puras são testadas com `node --test`. A interface é verificada no navegador.

## 8. Hospedagem

Qualquer hospedagem estática (Netlify, Vercel, GitHub Pages, Cloudflare Pages), publicando a pasta `public/` sem comando de build.

## 9. Licenças de terceiros

pdf.js usa Apache-2.0 e foliate-js usa MIT. As licenças ficam junto dos arquivos, em `public/vendor/`.
