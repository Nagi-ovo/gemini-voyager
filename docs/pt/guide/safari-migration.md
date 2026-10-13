# Migrando a extensão do Safari

::: warning Passo manual, feito uma única vez
A partir da **v1.6.0**, o app hospedeiro do Safari foi renomeado de "**Gemini Voyager**" para "**Voyager**". O macOS identifica os apps pelo nome, então, se você instalar a nova versão direto, ela vai ficar ao lado do app antigo, o que pode causar uma extensão duplicada ou um comportamento confuso. Faça essa troca uma única vez e as atualizações automáticas continuam normalmente depois.
:::

## Seus dados estão seguros

O Bundle ID do app não mudou. Suas pastas, sua biblioteca de prompts, a sincronização na nuvem e todas as configurações são preservadas. Este passo só substitui o app em si e nunca mexe nos seus dados.

## Passos da migração

1. **Feche o Safari completamente** (pressione `⌘Q` dentro do Safari, não basta fechar a janela).
2. Abra o **Finder → Aplicativos** e arraste o "**Gemini Voyager.app**" antigo para a Lixeira.
3. Abra o DMG baixado recentemente e arraste o "**Voyager.app**" para **Aplicativos**.
4. Reabra o Safari → **Ajustes → Extensões** e ative a "**Voyager Extension**".

## Duas coisas para não fazer

- ❌ **Não mantenha os dois apps.** Se o "Gemini Voyager.app" antigo continuar instalado, as duas extensões vão entrar em conflito.
- ❌ **Não clique em "Desinstalar" na extensão antiga dentro da aba de Extensões do Safari.** Isso aponta para o app antigo e deixa tudo mais confuso. Basta arrastar o app antigo para a Lixeira, como no passo 2.

## Depois disso

Feita essa única troca, as próximas versões do Safari vão atualizar o novo "Voyager" pelo atualizador automático integrado (Sparkle), sem precisar trocar nada manualmente.

Ficou com dúvidas? Fale com a gente pelo [GitHub Issues](https://github.com/voyager-crew/voyager/issues).
