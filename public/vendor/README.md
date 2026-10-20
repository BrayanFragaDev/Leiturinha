# Vendor

Bibliotecas de terceiros copiadas sem alteração. Não edite estes arquivos; para atualizar, troque a versão inteira e registre aqui.

## pdf.js (`pdfjs/`)

- Versão: 4.10.38
- Origem: pacote npm `pdfjs-dist@4.10.38` (`npm pack`)
- Licença: Apache-2.0 (arquivo `pdfjs/LICENSE`)
- Copiado do pacote:
  - `build/pdf.min.mjs`
  - `build/pdf.worker.min.mjs`
  - `cmaps/`
  - `standard_fonts/`
  - `LICENSE`

## foliate-js (`foliate-js/`)

- Origem: https://github.com/johnfactotum/foliate-js, branch `main`
- Commit: `78914aef4466eb960965702401634c2cb348e9b1` (2026-05-01)
- Copiado em: 2026-10-20
- Licença: MIT (arquivo `foliate-js/LICENSE`)
- Copiado do repositório:
  - todos os `.js` da raiz (inclui `view.js`, `paginator.js`, `epub.js`, `mobi.js`, `fb2.js`, `comic-book.js`, `fixed-layout.js`, `epubcfi.js`, `search.js` etc.; também os arquivos de configuração `eslint.config.js` e `rollup.config.js`, que o app não carrega)
  - `vendor/` (`zip.js`, `fflate.js`, `pdfjs/`)
  - `LICENSE`
- Não copiado: `tests/`, `ui/`, `rollup/`, `reader.html`, `.git` e demais arquivos.
