# Migração da extensão do Safari

::: warning Requer uma ação manual, apenas uma vez
A partir da **v1.6.0**, o app hospedeiro do Safari foi renomeado de "**Gemini Voyager**" para "**Voyager**". O macOS identifica os apps pelo nome, então instalar a nova versão diretamente a deixa convivendo com o app antigo, o que pode causar uma extensão duplicada ou comportamento confuso. Faça esta troca uma vez e as atualizações automáticas continuam normalmente depois.
:::

## Seus dados estão seguros

O Bundle ID do app não mudou. Suas pastas, biblioteca de prompts, sincronização na nuvem e todas as configurações são preservadas. Esta etapa apenas substitui o app em si — nunca toca nos seus dados.

## Passos de migração

1. **Encerre o Safari completamente** (pressione `⌘Q` dentro do Safari, não basta fechar a janela).
2. Abra o **Finder → Aplicativos** e arraste o antigo "**Gemini Voyager.app**" para a Lixeira.
3. Abra o DMG recém-baixado e arraste o "**Voyager.app**" para **Aplicativos**.
4. Reabra o Safari → **Ajustes → Extensões** e ative o "**Voyager Extension**".

## Duas coisas a não fazer

- ❌ **Não mantenha os dois apps.** Se deixar o antigo "Gemini Voyager.app" no lugar, as duas extensões vão entrar em conflito.
- ❌ **Não clique em "Desinstalar" na extensão antiga dentro do painel de Extensões do Safari.** Isso aponta para o app antigo e deixa tudo mais confuso. Basta arrastar o app antigo para a Lixeira, como no passo 2.

## Depois

Feita essa única troca, as próximas versões do Safari atualizam o novo "Voyager" pelo atualizador automático embutido (Sparkle) — sem mais troca manual.

Dúvidas? Fale com a gente no [GitHub Issues](https://github.com/Nagi-ovo/voyager/issues).
