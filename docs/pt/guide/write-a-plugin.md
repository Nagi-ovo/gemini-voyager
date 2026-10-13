# Escreva seu próprio plugin

Um plugin local é um plugin que você cria para você mesmo. Ele muda a aparência ou o layout do Gemini, AI Studio, ChatGPT, Claude ou DeepSeek, fica somente no seu navegador e não precisa de pull request nem de uma cópia do código-fonte do Voyager.

Como todo plugin do Voyager, ele é declarativo: um manifesto `plugin.json` mais CSS. Ele não roda código próprio. O Voyager verifica o plugin na importação, aplica as mudanças e remove todas elas quando você desliga o plugin. Um plugin importado começa desligado, para que você possa revisá-lo antes.

## Três formas de criar

### Descreva a mudança e deixe qualquer IA escrever

1. Abra o site que você quer alterar, abra o popup do Voyager e encontre o cartão **Plugins locais** (no Gemini e no AI Studio ele é o último item das configurações).
2. Escolha **Descrever uma mudança**, escreva uma frase ("Deixe minhas mensagens mais estreitas e oculte a barra lateral") e clique em **Gerar prompt**.
3. Copie o prompt para qualquer chat de IA, por conta própria, depois cole a resposta completa de volta e clique em **Verificar resposta**.
4. O Voyager mostra, em linguagem simples, o que o plugin altera. Importe-o e ative-o na lista de plugins.

O Voyager nunca envia o prompt para lugar nenhum: você escolhe a IA e leva o texto nos dois sentidos.

### Entregue a um agente de programação

Se você usa um agente de programação (Claude Code, Codex, Cursor e similares), dê a ele a skill de plugins do Voyager:

```text
https://voyager.nagi.fun/skills/write-voyager-plugin/SKILL.md
```

No cartão **Plugins locais**, abra **Descrever uma mudança** para encontrar o botão **Copiar link da skill**. A skill traz o contrato completo: os campos do manifesto, o que cada site declara, as primitivas e o que um plugin não pode fazer. Peça ao agente a mudança que você quer; ele cria uma pasta, escreve `plugin.json` e `style.css` e os verifica offline. Depois, clique em **Importar arquivos** no popup e selecione os dois arquivos.

Para manter a skill instalada, salve o arquivo como `write-voyager-plugin/SKILL.md` na pasta de skills do seu agente (no Claude Code, `~/.claude/skills/`).

### Escreva na mão

Com Node.js 18 ou mais recente:

```sh
npx create-voyager-plugin@latest init my-plugin --site claude
# edite my-plugin/plugin.json e my-plugin/style.css
npx create-voyager-plugin@latest check my-plugin
```

O `init` gera um `plugin.json` e um `style.css` que já passam nas verificações, além de um `AGENTS.md` com as regras daquele site. `--site` aceita `gemini`, `aistudio`, `chatgpt`, `claude` ou `deepseek`.

O `check` executa, offline, as mesmas verificações da importação no popup. Ele termina com código 0 quando o plugin pode ser importado e, caso contrário, imprime uma linha `path: message` para cada problema. Adicione `--json` para obter uma saída legível por máquina.

## O que um plugin pode fazer

- Adicionar CSS, com escopo sob uma classe `gv-` que o plugin adiciona à página.
- Adicionar uma classe, definir um atributo seguro ou um estilo inline, ou ocultar elementos. Os alvos são âncoras semânticas que o site declara (`userTurn`, `assistantTurn`, `composer`, …) ou seletores CSS.
- Oferecer configurações no popup: interruptores, controles deslizantes e listas suspensas, cujos valores chegam ao CSS pelos tokens `{{key}}`.
- No ChatGPT, Claude e DeepSeek, ativar uma primitiva do Voyager (cópia de fórmulas, a linha do tempo, diagramas Mermaid e outras) e aplicar cores na própria interface do Voyager.

## O que não pode fazer

Um plugin não pode executar JavaScript, reagir a cliques ou teclas, carregar qualquer coisa da rede (fontes, imagens, folhas de estilo), ler ou reescrever o conteúdo de uma mensagem, nem rodar em outros sites. Se um pedido precisar de algo disso, o material de criação instrui a IA a avisar e a montar a versão mais próxima que funcione.

## Regras que a importação verifica

Além das verificações comuns do manifesto (veja o [Guia de Contribuição de Plugins](./plugin-contribution.md)), um plugin local precisa:

- corresponder apenas a URLs dentro de um site que o Voyager suporta;
- usar apenas âncoras semânticas que todos os sites correspondentes declaram;
- adicionar exatamente uma classe por `addClass`, começando com `gv-`;
- usar configurações do tipo boolean, number ou select (string e color ainda não têm controle no popup);
- não usar `theme` no Gemini nem no AI Studio, e usar apenas as primitivas permitidas em cada site: `formulaCopy`, `vimInput`, `userLatex`, `codeCollapse`, `mermaid`, `wavedrom` e `echarts`, `sendShortcut`, `draftSave`, `turnNavigator` no Gemini, e `formulaCopy` e `sendShortcut` no AI Studio. Elas rodam o mesmo código das configurações próprias do Voyager. `formulaCopy` e `vimInput` (Cópia de fórmulas e Modo Vim na entrada) rodam uma vez por página: a configuração integrada ou um plugin, nunca os dois. Ao carregar a página, ou enquanto nenhum dos dois estiver rodando, a configuração integrada tem prioridade; depois disso, quem já está rodando continua e o outro aparece como pausado. Desligue um para passar o recurso ao outro. `userLatex`, `codeCollapse`, `mermaid`, `wavedrom` e `echarts` assumem a página elemento por elemento e rodam junto com a configuração integrada: uma linha ou bloco de código que o outro já estiver tratando fica com ele.

O `turnNavigator` local agora é compatível com o Gemini para usuários comuns, com `params.dataBackend: "shared"` e `engine: ">=1.9.0"`. Ele lê e grava os mesmos dados nativos de favoritos e hierarquia da linha do tempo oficial; os parâmetros de identidade da conversa, da conta e dos turnos não podem ser substituídos. A configuração oficial **Mostrar linha do tempo** entra em conflito com ele: desligue essa configuração antes de ativar o plugin local. Para voltar à linha do tempo oficial, desative primeiro o plugin local e depois ative a configuração. Business, Enterprise e cobertura de sites personalizados não são suportados.

As traduções (`i18n`) são opcionais.

## Compartilhando

Um plugin local fica no seu navegador; exporte o JSON pela lista de plugins para levá-lo a outro lugar. Se ele puder ajudar a todos, proponha-o para o catálogo oficial: o [Guia de Contribuição de Plugins](./plugin-contribution.md) descreve esse caminho.

Em todos os sites, apenas um plugin de atalho de envio roda por página. Enquanto um plugin estiver com o modo de envio, outro informa um conflito e fica pausado. O `mode` opcional (requer `"engine": ">=next"`, lançado na versão 1.9.0) pode ser `ctrlEnterSends` (padrão) ou `enterSends`. Confirmar a composição do IME não envia a mensagem. Gemini e AI Studio já permitem isso; os modos suportados estão listados abaixo.

No Gemini, `sendShortcut` pode substituir o recurso oficial de Ctrl/Cmd+Enter: desligue a opção oficial e depois ative o plugin local. Só `ctrlEnterSends` é suportado; o Enterprise continua inativo. `composerRoot` cobre a entrada principal e a de edição; `sendButton` exclui o botão Parar.

No AI Studio, `sendShortcut` exige `params.mode: "enterSends"`. Desligue a opção oficial de enviar com Enter para que o plugin local assuma. Ctrl/Cmd+Enter adiciona uma nova linha; Shift/Alt+Enter segue o comportamento do site.

No Gemini, `draftSave` compartilha os registros oficiais `gvDraft_<caminho completo>`, incluindo `/u/N` e as rotas dos Gems. Desativar mantém os rascunhos salvos; vários plugins na mesma página podem usar esses registros. Ao fechar a página, a extensão tenta salvar a última entrada, mas o fechamento do navegador não garante a conclusão do armazenamento assíncrono. Gravações e limpeza são coordenadas apenas nesta página; trocar de e-mail dentro do mesmo slot `/u/N` continua compartilhando os rascunhos salvos.
