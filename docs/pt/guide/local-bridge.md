# Ponte local do ChatGPT

ChatGPT · Ponte local é um plugin oficial do Voyager. Ele vem desativado.

Depois de ativado e pareado, o Voyager oferece aos programas locais deste computador um conjunto de ações na página do ChatGPT. Um programa diz o que quer fazer, e o Voyager faz isso em uma aba que ele mesmo abre, usando o ChatGPT em que você já está conectado no navegador. Para o ChatGPT, é uma conversa comum vinda do seu próprio navegador.

## O que ela oferece

- Abrir uma conversa: nova ou existente
- Escolher o modelo: só no modo chat; nunca muda o ChatGPT para o modo Work
- Enviar um prompt, com anexos
- Esperar a resposta e lê-la
- Ler a última resposta de uma conversa existente
- Listar e criar projetos
- Listar, enviar e remover arquivos de um projeto (a remoção é imediata e permanente)

## Como ela se comporta

**Só local.** A ponte só conversa com programas deste computador por `127.0.0.1`, e só depois do pareamento.

**Aba própria.** Cada tarefa roda em uma aba do ChatGPT aberta pelo Voyager, e a aba é fechada ao terminar.

**Uma tarefa por vez.** Só uma tarefa roda de cada vez.

**Login e verificações ficam com você.** Se o ChatGPT pedir para você entrar na conta ou resolver uma verificação, a ponte para e avisa. Ela nunca tenta contornar isso.

**Seu plano, informado.** Todo resultado informa seu plano do ChatGPT (`Pro Lite ($100)`, `Pro ($200)`, …) conforme a página relatou pela última vez.

**Navegadores.** Testado no Chrome. As versões do Voyager para Edge e Firefox também incluem a ponte; a do Safari, não.

## Uso de referência: Voyager CLI

[Voyager CLI](https://github.com/voyager-crew/voyager-cli) (npm `@voyager-crew/cli`, comando `voyager`) é um cliente de referência construído sobre essas ações: pergunte ao ChatGPT pelo terminal, ou deixe seu agente de programação fazer isso.

### Em três passos

1. Instale o CLI (Node.js 20.3 ou mais recente):

   ```sh
   npm install -g @voyager-crew/cli
   ```

2. No pop-up do Voyager, abra **Plugins**, ative **ChatGPT · Ponte local** e permita o acesso a chatgpt.com.
3. Pareie uma vez:

   ```sh
   voyager pair
   ```

   Digite o código de oito caracteres exibido nas configurações de "Ponte local" no pop-up.

### Alguns exemplos

```sh
voyager ask "Explique este stack trace" --attach crash.log
voyager ask --chat <link|id> "E os casos extremos?" # continuar uma conversa
voyager read <link|id>                              # salvar a última resposta de uma conversa
voyager project upload "Tese" ./thesis              # todas as conversas do projeto podem ler
voyager ask --project "Tese" "Onde o argumento é mais fraco?"
```

A resposta é salva como `response.md`, e as perguntas usam por padrão o GPT-6 Pro no modo chat.

Como esperar respostas longas, o que cada código de saída significa e todos os comandos estão no [README do CLI](https://github.com/voyager-crew/voyager-cli#readme). As instruções para Claude Code, Codex e outros agentes estão em [SKILL.md](https://github.com/voyager-crew/voyager-cli/blob/main/skills/voyager/SKILL.md).

## Aviso

- Voyager e Voyager CLI são projetos comunitários de código aberto. Não são afiliados à OpenAI nem endossados por ela.
- A ponte automatiza o ChatGPT na web no seu próprio navegador conectado. Os [Termos de Uso](https://openai.com/policies/terms-of-use/) da OpenAI restringem a extração de resultados por meios automatizados ou programáticos; decida por conta própria se o seu uso está de acordo antes de depender dele. Qualquer restrição aplicada à sua conta por isso é por sua conta e risco.
- Ferramentas semelhantes adotam a mesma postura: o [oracle](https://github.com/steipete/oracle), por exemplo, deixa o modo navegador como um recurso experimental que precisa ser ativado e recomenda a API a quem quer evitar o risco. Se você precisa de um caminho com suporte, use a API da OpenAI.
- A ponte é para a sua própria conveniência, no seu próprio computador: conecte apenas a sua conta, não a use para atender outras pessoas, compartilhar uma conta ou revender o seu uso, e use-a apenas para fins legais.
