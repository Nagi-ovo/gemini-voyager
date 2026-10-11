# Escreva o seu próprio plugin

Um plugin local é um plugin que cria para si. Altera o aspeto ou a disposição do Gemini, AI Studio, ChatGPT, Claude ou DeepSeek, vive apenas no seu navegador e não precisa de nenhuma pull request nem de uma cópia do código-fonte do Voyager.

Como todos os plugins do Voyager, é declarativo: um manifest `plugin.json` mais CSS. Não executa código próprio. O Voyager verifica-o ao importar, aplica as alterações e remove-as todas quando o desativa. Um plugin importado começa desativado, para que o possa rever primeiro.

## Três formas de o criar

### Descreva-o e deixe qualquer IA escrevê-lo

1. Abra o site que quer alterar, abra o popup do Voyager e procure o cartão **Plugins locais** (no Gemini e no AI Studio é a última entrada das definições).
2. Escolha **Descrever uma mudança**, escreva uma frase («Torna as minhas mensagens mais estreitas e esconde a barra lateral») e escolha **Gerar prompt**.
3. Copie o prompt para o chat de IA que preferir, cole de volta a resposta completa e escolha **Verificar resposta**.
4. O Voyager mostra em linguagem simples o que o plugin altera. Importe-o e ative-o na lista de plugins.

O Voyager nunca envia o prompt para lado nenhum: é o utilizador que escolhe a IA e que leva o texto num sentido e no outro.

### Entregue-o a um agente de programação

Se usa um agente de programação (Claude Code, Codex, Cursor e semelhantes), dê-lhe a skill de plugins do Voyager:

```text
https://voyager.nagi.fun/skills/write-voyager-plugin/SKILL.md
```

No cartão **Plugins locais**, abra **Descrever uma mudança** para encontrar o botão **Copiar link da skill**. A skill contém o contrato completo: os campos do manifest, o que cada site declara, as primitivas e o que um plugin não pode fazer. Peça ao agente a alteração que quer; ele cria uma pasta, escreve `plugin.json` e `style.css` e verifica-os offline. Depois escolha **Importar arquivos** no popup e selecione os dois ficheiros.

Para manter a skill instalada, guarde o ficheiro como `write-voyager-plugin/SKILL.md` na pasta de skills do seu agente (no Claude Code, `~/.claude/skills/`).

### Escreva-o à mão

Com Node.js 18 ou mais recente:

```sh
npx create-voyager-plugin@latest init my-plugin --site claude
# edite my-plugin/plugin.json e my-plugin/style.css
npx create-voyager-plugin@latest check my-plugin
```

`init` gera um `plugin.json` e um `style.css` que já passam nas verificações, além de um `AGENTS.md` com as regras desse site. `--site` aceita `gemini`, `aistudio`, `chatgpt`, `claude` ou `deepseek`.

`check` executa offline as mesmas verificações que a importação do popup. Termina com o código 0 quando o plugin pode ser importado e, caso contrário, imprime uma linha `path: message` por problema. Acrescente `--json` para obter uma saída legível por máquina.

## O que um plugin pode fazer

- Acrescentar CSS, limitado a uma classe `gv-` que o plugin adiciona à página.
- Adicionar uma classe, definir um atributo seguro ou um estilo inline, ou esconder elementos. Os alvos são chaves semânticas que o site declara (`userTurn`, `assistantTurn`, `composer`, …) ou seletores CSS.
- Oferecer definições no popup: interruptores, controlos deslizantes e listas pendentes, cujos valores chegam ao CSS através de tokens `{{key}}`.
- No ChatGPT, Claude e DeepSeek, ativar uma primitiva do Voyager (cópia de fórmulas, a linha do tempo, diagramas Mermaid e outras) e mudar as cores da própria interface do Voyager.

## O que não pode fazer

Um plugin não pode executar JavaScript, reagir a cliques ou teclas, carregar nada da rede (tipos de letra, imagens, folhas de estilo), ler ou reescrever o que uma mensagem diz, nem correr noutros sites. Se um pedido precisar de alguma destas coisas, o material de autoria diz à IA para o dizer claramente e para construir a versão mais próxima que funcione.

## Regras verificadas na importação

Além das verificações comuns do manifest (veja [Contribuir plugins](./plugin-contribution.md)), um plugin local tem de:

- corresponder apenas a URL dentro de um site suportado pelo Voyager;
- usar apenas chaves semânticas declaradas por todos os sites a que corresponde;
- adicionar exatamente uma classe por `addClass`, começada por `gv-`;
- usar definições boolean, number ou select (string e color ainda não têm controlo no popup);
- não usar `theme` nem primitivas no Gemini ou no AI Studio.

As traduções (`i18n`) são opcionais.

## Partilhá-lo

Um plugin local fica no seu navegador; exporte o JSON a partir da lista de plugins para o levar para outro lado. Se puder ser útil a todos, proponha-o para o catálogo oficial: [Contribuir plugins](./plugin-contribution.md) descreve esse caminho.
