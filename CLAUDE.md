# Leitor

Leitor de PDF, ePub e ebooks no navegador. Os arquivos ficam só no aparelho do usuário (IndexedDB), sem servidor de dados. O produto está em [produto.md](produto.md) e o plano de implementação em [plano.md](plano.md).

## Comandos

```bash
npm start        # servidor local em http://localhost:5174
npm test         # node --test test/*.test.js
node tools/make-fixtures.js   # gera arquivos de exemplo em fixtures/
```

Requer Node ≥ 20. Não há `npm install`, porque o projeto não tem dependências.

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
    reader-pdf.js      adaptador pdf.js
    reader-foliate.js  adaptador foliate-js (epub, mobi, azw3, fb2, cbz)
    library-view.js, reader-view.js   telas
  vendor/          pdf.js e foliate-js copiados, em versões fixas (não editar)
server.js          servidor estático de desenvolvimento
test/              testes node:test das regras puras
tools/             scripts de apoio (fixtures)
fixtures/          arquivos de exemplo gerados (não versionados)
```

## Convenções

- JavaScript puro, módulos ES (`"type": "module"`), sem build, sem framework e sem dependências npm.
- Toda a interface fica em **português do Brasil**. Os nomes no código ficam em inglês.
- Os leitores implementam a interface comum `Reader` (veja `reader-pdf.js`). As telas nunca chamam pdf.js ou foliate-js diretamente.
- Local de leitura é sempre `string`: `pdf:<página>` no PDF e um CFI nos demais formatos.
- Regras puras (sem DOM) ficam em módulos testáveis no Node. O código que depende de DOM ou IndexedDB recebe as dependências por parâmetro.
- `localStorage` e IndexedDB sempre ficam dentro de try/catch. Se falharem, o app continua funcionando em modo temporário.
- Nada é enviado para fora do navegador: sem CDN em tempo de execução, sem analytics e sem fetch para terceiros.
- Arquivos em `public/vendor/` não são editados. Para atualizar, troque a versão inteira e registre em `public/vendor/README.md`.
- Mudanças visíveis são verificadas no navegador (preview "leitor" em `.claude/launch.json`).
