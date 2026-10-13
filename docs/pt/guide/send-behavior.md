# Comportamento de envio

::: info
**Nota**: Este recurso está disponível na versão 1.3.7 e posteriores.
:::

Altere o atalho de envio para `Ctrl+Enter` (ou `⌘+Enter` no macOS), fazendo do `Enter` uma tecla de nova linha para que você possa escrever prompts de várias linhas com facilidade.

## Por que este recurso

Por padrão, apertar `Enter` envia a mensagem imediatamente. Ao escrever prompts mais longos, colar código de várias linhas ou formatar cuidadosamente o que digita, isso costuma causar envios acidentais: você só queria pular uma linha, mas a mensagem já foi enviada.

Quando ativado:

- **Enter** → Insere uma nova linha
- **Ctrl+Enter** (macOS: **⌘+Enter**) → Envia a mensagem

Shift+Enter e a composição de IME mantêm o comportamento próprio do site, e Ctrl/⌘+Enter aguarda enquanto um anexo ainda está sendo enviado.

## Como ativar

1. Abra o popup do Voyager.
2. Em **Opções de entrada**, ative **Ctrl+Enter para enviar** (exibido como **⌘+Enter para enviar** no macOS).

## Outros sites

- **AI Studio** funciona ao contrário: ative **Enter para enviar no AI Studio** para enviar com `Enter` e adicionar uma nova linha com `Ctrl/⌘+Enter`.
- **Claude, ChatGPT e DeepSeek**: instale o plugin **Ctrl/Cmd+Enter to send** para esse site no [Mercado de plugins](/pt/plugins).
- **Safari**: se o Gemini exigir apertar Enter duas vezes para enviar, ative **Corrigir tecla Enter no Safari**.

## Recursos

- **Zero sobrecarga de desempenho**: Quando desativado, nenhum listener de eventos de teclado fica ativo, sem impacto no desempenho da página.
- **Troca instantânea**: As mudanças passam a valer logo após alternar a opção nas configurações, sem precisar recarregar a página.
