# Guia de Contribuição de Plugins

O sistema de plugins do Voyager é baseado em plugins declarativos: você descreve os metadados do plugin e as operações de DOM no `plugin.json` e descreve as mudanças visuais em CSS. Os plugins não executam JavaScript remoto; o mecanismo de plugins integrado do Voyager interpreta o manifesto e os estilos.

Isso torna os plugins mais fáceis de revisar e de manter. Se você quer contribuir com um plugin, comece por aqui.

## Só para você: plugins locais

Um plugin de que você só precisa no seu próprio navegador não passa por este processo. Crie-o como plugin local e importe-o no popup: sem Issue, sem PR, sem clonar o repositório. [Escreva seu próprio plugin](./write-a-plugin.md) explica as três formas de criar um, incluindo o verificador `create-voyager-plugin` e a skill para agentes de código.

## Caminho recomendado

1. Confirme que a ideia cabe em um plugin: largura de leitura, correções de layout, ajustes de tema, ocultar ou marcar elementos da página e adaptações simples para sites costumam ser boas candidatas.
2. Abra uma Issue no repositório do Voyager primeiro. Explique o problema, o site-alvo e a diferença em relação aos plugins existentes; aguarde a aprovação explícita de um mantenedor antes de programar ou abrir um PR.
3. Use o `plugin.json` para metadados, correspondências de sites, configurações e contribuições.
4. Coloque os estilos em `style.css` no mesmo diretório do plugin e referencie-o em `contributes.styles`.
5. Teste localmente e inclua no PR páginas de teste, capturas de tela ou uma gravação curta. Os mantenedores decidirão se ele está pronto para o catálogo oficial.

## Estrutura de diretórios

Os plugins oficiais incluídos ficam em `src/features/plugins/catalog/`, com um diretório por plataforma de plugin:

```
src/features/plugins/catalog/
  marketplace.json                        índice lido pela loja de plugins da documentação
  sites/<site>/site.json                  o adaptador do site, como dados
  sites/<site>/plugins/<id>/plugin.json   um plugin declarativo
  sites/<site>/plugins/<id>/style.css     os estilos dele
  sites/<site>/plugins/<id>/README.md     o que ele corrige e por quê
```

A descoberta é automática: `catalog/sites/index.ts` encontra cada `site.json` e
cada `plugin.json` com `import.meta.glob`, então adicionar um site ou um plugin
significa apenas adicionar arquivos. Não há tabela de mapeamento para editar.

O `marketplace.json` não é essa tabela de mapeamento. Ele é apenas o índice que a
loja de plugins da documentação lê, e um teste mantém esse índice sincronizado
com a descoberta; por isso, um novo plugin também precisa de uma entrada ali. O
`source` dele é o caminho relativo ao catálogo, por exemplo
`sites/deepseek/plugins/reading-width/plugin.json`. Os plugins em `sites/gemini/`
e `sites/aistudio/` são a exceção: eles vêm dentro do Voyager e ficam fora do
`marketplace.json`.

Os `matches` de um plugin devem ficar dentro dos `matches` do site onde ele está.
Um plugin que ultrapasse o próprio site falha no build.

## Chaves semânticas de seletores

O `site.json` associa um vocabulário fixo de chaves semânticas a seletores CSS
específicos de cada site. O vocabulário é definido em
`src/features/plugins/sites/semanticKeys.ts`; um `site.json` só pode usar chaves
dessa lista, e uma chave desconhecida é rejeitada.

- `userTurn`: um contêiner de mensagem do usuário.
- `assistantTurn`: um contêiner de mensagem do assistente.
- `thinkingBlock`: a seção de raciocínio dentro de uma resposta do assistente.
- `codeBlock`: um bloco de código renderizado.
- `composer`: a entrada de prompt onde o usuário digita.
- `sidebar`: a lista de conversas ou a barra de navegação.
- `sidePanel`: um painel secundário, como artefatos ou canvas.
- `headerActions`: o grupo de ações no canto superior direito da visualização da conversa.
- `scrollContainer`: o elemento que rola a conversa.
- `composerRoot`: o contêiner em volta da entrada de prompt e dos botões de ação.
- `sendButton`: o botão que envia o prompt; alguns sites só o mostram quando o prompt não está vazio.

Um site declara apenas as chaves que realmente consegue fornecer. Os plugins
referenciam uma chave em vez de um seletor bruto usando
`{ "kind": "semantic", "key": "userTurn" }` como `target` de uma operação de DOM,
então uma reformulação do site é uma correção em um único arquivo, o `site.json`.

`conversationIdPattern` é um campo separado do `site.json`, e não um seletor: é
uma expressão regular sobre o caminho da URL cujo primeiro grupo de captura é o
ID da conversa, como `^/chat/([^/?#]+)`.

## Adicionando uma nova plataforma

Adicionar um novo site de chat tem duas camadas separadas:

1. O **adaptador do site**, `catalog/sites/<site>/site.json`, ensina o Voyager a
   reconhecer o site e a encontrar as mensagens do usuário, as respostas do
   assistente, a entrada de prompt, a barra lateral e os marcadores de tema.
2. Um **plugin** em `catalog/sites/<site>/plugins/<id>/` resolve um problema
   específico do usuário nesse site, como a largura de leitura ou a correção de
   uma renderização.

Um `site.json` contém `id` (igual ao nome do diretório), `label`, `matches`,
`selectors`, `theme`, `brandColor`, `capabilities` e, opcionalmente,
`conversationIdPattern` e `turnKeyAttributes`. O `turnKeyAttributes` indica os
atributos que mantêm a identidade de uma mensagem do usuário quando a página a
renderiza de novo; o rastreamento de envio (usado pela Atividade das pastas e
pelos carimbos de data/hora da linha do tempo) só roda em um site que o defina,
junto com `composer`, `userTurn` e um `conversationIdPattern`.
`validateSiteAdapterData`, em `src/features/plugins/sites/siteAdapterData.ts`,
faz essa validação, e `bun run catalog:build` valida todos os sites e plugins
antes da publicação.

Toda plataforma de plugin é dados. Hoje os sites são ChatGPT, Claude e DeepSeek.
Gemini e AI Studio são superfícies nativas do Voyager com `site.json` próprio
(`catalog/sites/gemini/` e `catalog/sites/aistudio/`), mas isso vem dentro do
pacote e nunca é publicado no catálogo remoto. Os cinco adaptadores,
`adapters/gemini.ts`, `aistudio.ts`, `claude.ts`, `chatgpt.ts` e `deepseek.ts`,
são cascas de uma linha sobre o `site.json` de cada um: edite o JSON, não o TypeScript.

O catálogo publicado por host também carrega os dados do site, então uma correção
de seletor em `site.json` pode chegar aos usuários sem uma nova versão da
extensão. Um site completamente novo ainda precisa de uma nova versão, porque
também depende de permissão de host e do registro do content script, que vêm
dentro do pacote.

Para uma nova plataforma, como o DeepSeek, mantenha o trabalho do adaptador
focado no contrato da plataforma. Coloque o `site.json`, os testes obrigatórios
de seletores e a documentação mínima necessária para explicar o suporte em uma
única mudança completa. O registro de sites pega o novo adaptador a partir do
próprio arquivo, então não há lista de registro para editar. Não adicione um
novo site para cada plugin.

Depois que o adaptador for aceito, os plugins seguintes podem ser enviados como
mudanças separadas e focadas. Se várias mudanças dependem umas das outras, uma
cadeia de PRs empilhados é útil: cada branch posterior é baseada na anterior, e
cada PR mostra apenas a sua própria funcionalidade incremental. A cadeia ainda
deve seguir a mesma regra de escopo: um objetivo claro para o usuário por PR, com
seus testes obrigatórios e a limpeza necessária.

Suporte a um site não exige integração com API de modelo. Não adicione content
scripts estáticos nem permissões de host obrigatórias para uma nova plataforma;
use o fluxo existente de permissão opcional e registro dinâmico para sites que
têm apenas plugins.

O caminho de permissão opcional e de registro dinâmico depende da versão do
navegador. Chrome e Edge suportam o fluxo usado pela extensão. O Firefox exige a
versão 128 ou mais recente para permissões de host opcionais, e o Safari exige a
versão 16.4 ou mais recente para o registro dinâmico de content scripts. Em
versões mais antigas dos navegadores compatíveis, o popup pode recusar corretamente
ativar um plugin para um site personalizado, porque as APIs necessárias não
conseguem manter uma permissão persistente; não contorne isso adicionando uma
permissão de host estática ampla sem aprovação do mantenedor.

## Escopo do plugin

Os plugins devem ter escopo pelo problema do usuário que resolvem, e não ser divididos mecanicamente por plataforma.

Um plugin do catálogo fica em uma pasta de site, e cada um dos seus `matches` precisa estar coberto pelo `site.json` dessa pasta (`bun run plugin:check` falha caso contrário), então um mesmo plugin não pode cobrir Claude e ChatGPT ao mesmo tempo. Quando a mesma funcionalidade serve a várias plataformas, como largura de leitura, navegação na página ou layout de blocos de código, envie um plugin por pasta de site (por exemplo `sites/claude/plugins/reading-width` e `sites/chatgpt/plugins/reading-width`) e mantenha nomes, configurações e descrições consistentes entre eles.

Se cada plataforma precisa de configurações, lógica de DOM ou textos para o usuário muito diferentes, plugins separados são mais claros. Não force comportamentos não relacionados dentro de um único plugin só para que ele "cubra tudo"; um plugin deve resolver um problema claro.

Regra rápida:

- Mesmo objetivo para o usuário, mesmas configurações, apenas seletores diferentes: um plugin por pasta de site, com nomes e configurações consistentes.
- Mesmo tema, mas o comportamento da plataforma é muito diferente: separe, mantendo nomes e descrições relacionados.
- Objetivos diferentes: não junte.

## Evite plugins duplicados

Antes de enviar, verifique a loja de plugins e os plugins oficiais existentes. Se já existe um bom plugin, melhore-o em vez de criar um parecido.

Um plugin duplicado só vale a pena quando traz uma melhoria clara, como:

- Dar suporte a uma plataforma importante que o plugin original não cobre.
- Corrigir um problema de compatibilidade que o plugin original não consegue resolver.
- Ter desempenho, acessibilidade ou manutenibilidade claramente melhores.
- Oferecer uma experiência de uso diferente e significativa, e não apenas uma cópia renomeada ou levemente reestilizada.

Isso mantém a loja de plugins organizada e ajuda os usuários a escolher.

## Exemplo mínimo

Comece pelo scaffold, em vez de um diretório vazio: `bun run plugin:new <id-segment> --site <site>` cria `catalog/sites/<site>/plugins/<id-segment>/` com um `plugin.json`, um `style.css` e um `README.md`, e acrescenta a entrada do `marketplace.json` para você. O que ele gera é um ponto de partida, não uma aprovação; o manifesto que você preencher tem esta forma:

```json
{
  "$schema": "https://voyager.nagi.fun/plugin.schema.json",
  "id": "your-name.example-plugin",
  "name": "Example Plugin",
  "version": "1.0.0",
  "description": "A short description of what this plugin improves.",
  "author": "your-name",
  "category": "readability",
  "license": "MIT",
  "engine": ">=1.0.0",
  "tier": "declarative",
  "matches": ["https://claude.ai/*"],
  "contributes": {
    "styles": [{ "file": "style.css" }],
    "domOps": [
      {
        "op": "addClass",
        "target": "body",
        "className": "gv-plugin-example"
      }
    ]
  }
}
```

A linha `$schema` é opcional e serve apenas para o seu editor: ela aponta para o JSON Schema do manifesto, para que o arquivo seja validado e completado enquanto você digita. Um `site.json` tem o seu próprio schema em `https://voyager.nagi.fun/site.schema.json`.

O `style.css` pode usar CSS comum, mas os estilos do plugin devem ficar sob a sua própria classe `gv-plugin-*`:

```css
.gv-plugin-example .some-target {
  max-width: 880px;
}
```

## Notas sobre o manifesto

- Use um prefixo de domínio invertido ou de autor no `id`, como `your-name.reading-width`, para evitar colisões.
- Mantenha os `matches` restritos. Corresponda apenas aos sites em que o plugin realmente precisa rodar.
- Os `matches` de um plugin podem listar vários hosts somente quando o `site.json` do site cobre todos eles (por exemplo chatgpt.com e chat.openai.com); para cobrir outro site, adicione um plugin na pasta desse site.
- Valores recomendados de `category`: `render-fix`, `theme`, `layout`, `readability`, `productivity`, `integration` ou `other`.
- Defina `engine` com a versão do mecanismo de plugins de que você precisa. Os plugins oficiais podem servir de exemplo.
- Adicione `i18n` para chinês, inglês e outros idiomas comuns, sempre que possível.

## Limites de CSS e de recursos

Os plugins declarativos são validados como entrada não confiável, então mantenha os recursos autocontidos:

- Não use `@import`.
- Não referencie imagens remotas, fontes externas nem CSS remoto.
- Você pode usar CSS comum, propriedades customizadas e as substituições de valores das configurações do Voyager.
- Prefixe as classes do plugin com `gv-plugin-` para evitar que os estilos vazem para o site hospedeiro ou para o próprio Voyager.

Se o seu plugin precisar de configurações, comece por configurações numéricas, quando possível. Por exemplo, um plugin de largura de leitura pode gravar um valor de configuração em uma variável CSS e deixar o CSS consumi-lo.

## Limites das operações de DOM

Os plugins declarativos suportam atualmente:

- `addClass`: adiciona uma classe aos elementos-alvo.
- `setAttribute`: define um atributo.
- `setStyle`: define estilos inline ou variáveis CSS. Termine um valor com `!important` para aplicá-lo com essa prioridade; versões mais antigas do Voyager descartam esse valor, então defina `engine` como `>=next` se o seu plugin depender disso. Atalhos como `margin` são rastreados por propriedade longa, então desligar um plugin nunca apaga o `margin-top` de outro plugin.
- `hide`: oculta os elementos-alvo.

Os alvos podem ser seletores CSS ou as chaves semânticas listadas acima, escritas como `{ "kind": "semantic", "key": "userTurn" }`. As chaves semânticas costumam ser mais estáveis, mas exigem que o adaptador atual do site declare essa chave.

As operações declarativas devem ser reversíveis e seguras para rodar várias vezes. Não dependa de um estado único da página, e não presuma que o DOM da página nunca muda.

### Primitivas

Alguns comportamentos não podem ser descritos com CSS e uma edição reversível de DOM. Uma
primitiva é código de primeira parte que vem dentro do Voyager e que um manifesto pode
chamar pelo nome, por meio da operação `native`:

```json
{
  "engine": ">=1.3.0",
  "requires": { "handlers": ["formulaCopy"] },
  "contributes": {
    "domOps": [{ "op": "native", "handler": "formulaCopy", "params": {} }]
  }
}
```

O manifesto escolhe uma primitiva e a configura. Ele nunca fornece lógica, e os
`params` são validados pela própria primitiva antes de rodar.

Duas regras se aplicam a qualquer plugin que use uma primitiva:

- Todo site que o plugin corresponde deve declarar as chaves semânticas que a primitiva lê (`mermaid`, por exemplo, lê `assistantTurn` e `codeBlock`). O `requires.handlers` é opcional: a operação `native` já implica a sua primitiva.
- O `engine` deve ser no mínimo a versão do mecanismo que a introduziu pela primeira vez. O `formulaCopy` foi lançado no engine 1.3.0, então um plugin que o usa declara `">=1.3.0"`. Um intervalo menor falha em `bun run catalog:build`, porque um Voyager antigo reportaria um handler ausente em vez de pedir ao usuário que atualize.

As primitivas só crescem: um novo parâmetro é sempre opcional, e uma mudança incompatível
é lançada com um novo nome.

Um plugin que altera o comportamento também pode trazer um `changelog` de uma linha, que o popup mostra ao lado da versão. Traduza-o em `i18n.<locale>.changelog`, junto de `name` e `description`.

## Quando não usar um plugin comum

Se um recurso precisa executar JavaScript, interceptar requisições de rede, ler ou gravar dados internos do Voyager, ou depender de lógica complexa em tempo de execução, ele não é um bom candidato a plugin declarativo comum.

Abra uma Issue primeiro e descreva a necessidade. Se ela realmente exigir uma capacidade integrada, podemos considerar implementá-la no próprio repositório do Voyager como plugin builtin/nativo, como o Formula Copy.

## Antes de abrir um PR

Execute `bun run plugin:check <diretório do plugin>` e cole a saída no PR. Ele relata todos os problemas de uma vez, desde o manifesto e o CSS até a contenção no site, as primitivas, as chaves semânticas, os dez idiomas e o README; o CI executa a mesma verificação em todos os plugins incluídos.

- O plugin fica desativado por padrão, e os usuários o ativam por conta própria.
- Você verificou que não há um plugin quase idêntico; se houver, melhore primeiro o plugin existente.
- Você testou os temas claro e escuro no site-alvo.
- Os `matches` não cobrem sites não relacionados.
- Não há recursos remotos.
- O diretório do plugin inclui `plugin.json`, os arquivos CSS necessários e um README curto.
- Para um plugin oficial, o diretório fica em `catalog/sites/<site>/plugins/<id>/`, os `matches` ficam dentro dos `matches` do site, e `catalog/marketplace.json` o lista (exceto os plugins do Gemini e do AI Studio, que vêm com o Voyager).
- O PR descreve as páginas de teste, as capturas de tela ou gravações e as áreas da página afetadas.

Mantenha o plugin simples, focado e reversível. Um plugin que resolve um problema claro é muito mais fácil de aprovar e manter.
