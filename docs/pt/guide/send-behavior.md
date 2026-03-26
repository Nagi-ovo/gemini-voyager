# Comportamento de Envio

::: info
**Nota**: Esta funcionalidade está disponível na versão 1.3.7 e posteriores.
:::

Altere o atalho de envio do Gemini para `Ctrl+Enter` (`⌘+Enter` no macOS), transformando `Enter` numa tecla de nova linha para que possa compor prompts de várias linhas com tranquilidade.

## Porquê esta funcionalidade

Por defeito, pressionar `Enter` no Gemini envia a mensagem imediatamente. Ao escrever prompts mais longos, colar código de várias linhas ou formatar cuidadosamente a sua entrada, isto frequentemente leva a envios acidentais — só queria uma nova linha, mas a mensagem já foi enviada.

Quando ativado:

- **Enter** → Inserir nova linha
- **Ctrl+Enter** (macOS: **⌘+Enter**) → Enviar mensagem

## Como ativar

1. Abra o painel de definições do Voyager (popup).
2. Encontre o interruptor **Ctrl+Enter para enviar**.
3. Ative-o.

## Características

- **Zero sobrecarga de desempenho**: Quando desativado, nenhum listener de eventos de teclado está ativo — sem impacto no desempenho da página.
- **Alternância instantânea**: As alterações entram em vigor imediatamente após ativar nas definições, sem necessidade de atualizar a página.
- **Compatível com modo de edição**: Também funciona ao editar mensagens enviadas anteriormente.
