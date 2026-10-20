# Leitor

Leitor de PDF, ePub e outros ebooks no navegador. Os arquivos ficam só no aparelho de quem usa (IndexedDB); não existe servidor de dados.

## Como rodar

Requer Node 20 ou superior. O projeto não tem dependências, então não há `npm install`.

```bash
npm start                     # servidor local em http://localhost:5174
npm test                      # testes das regras puras (node --test)
node tools/make-fixtures.js   # gera arquivos de exemplo em fixtures/
```

## Formatos suportados

| Formato | Extensões | Motor |
|---|---|---|
| PDF | `.pdf` | pdf.js |
| ePub 2/3 | `.epub` | foliate-js |
| Kindle sem DRM | `.mobi`, `.azw3`, `.azw` | foliate-js |
| FictionBook | `.fb2`, `.fbz` | foliate-js |
| Quadrinhos | `.cbz` | foliate-js |

O formato é detectado pelo conteúdo e, na falta dele, pela extensão. Arquivos com DRM ou corrompidos são recusados.

## Privacidade

- Os livros, o progresso e os marcadores ficam no IndexedDB do navegador. Tema e fonte ficam no `localStorage`.
- Nada é enviado para fora do navegador: sem CDN em tempo de execução, sem analytics e sem chamadas a terceiros.
- Se o IndexedDB não estiver disponível (por exemplo, em janela privada de alguns navegadores), o app funciona em modo temporário e avisa que os livros se perdem ao fechar a página.

## Hospedagem

Qualquer hospedagem estática serve. Publique a pasta `public/`, sem comando de build.

| Serviço | Como publicar `public/` |
|---|---|
| Netlify | Build command em branco; Publish directory: `public` |
| Vercel | Framework "Other", sem build command; Output directory: `public` |
| GitHub Pages | Publicar uma subpasta exige uma GitHub Action (por exemplo, `actions/upload-pages-artifact` com `path: public`) ou mover o conteúdo de `public/` para a raiz/pasta publicada |
| Cloudflare Pages | Sem build command; Build output directory: `public` |

## Estrutura

```
public/            site estático (é o que vai para a hospedagem)
  index.html, styles.css
  js/
    app.js         inicialização e troca de telas
    router.js      rotas por hash: #/ e #/ler/<id>
    formats.js     detecção de formato por bytes/extensão
    store.js       createStore(): IndexedDB ou memória
    memory-store.js, idb-store.js
    library.js     regras da biblioteca (importar, listar, progresso, marcadores)
    prefs.js       tema e fonte (localStorage)
    format.js      formatação de %, tamanho e data
    locations.js   locais de PDF ("pdf:<página>")
    cover-color.js cor da capa gerada a partir do título
    toast.js       avisos curtos na tela
    reader-pdf.js      adaptador pdf.js
    reader-foliate.js  adaptador foliate-js (epub, mobi, azw3, fb2, cbz)
    library-view.js, reader-view.js   telas
  vendor/          pdf.js e foliate-js copiados, em versões fixas (não editar)
server.js          servidor estático de desenvolvimento
test/              testes node:test das regras puras
tools/             scripts de apoio (fixtures)
fixtures/          arquivos de exemplo gerados (não versionados)
```

## Licenças de terceiros

- pdf.js: Apache-2.0
- foliate-js: MIT

As licenças ficam junto dos arquivos, em `public/vendor/`. Versões e origem estão em `public/vendor/README.md`.
