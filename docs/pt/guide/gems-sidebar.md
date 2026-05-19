# Gems recentes na barra lateral

O redesign do Gemini 2026 primeiro moveu os Gems para trás do menu de configurações e depois colocou silenciosamente uma entrada de navegação no topo da barra lateral — mas é apenas um link que te leva para `/gems/view`.

O Voyager faz com que essa entrada nativa de Gems "se expanda" em uma lista dos seus gems mais recentes, diretamente na barra lateral.

## Como fica

- **Pendurado abaixo da entrada nativa de Gems.** Indentado para se alinhar com o rótulo "Gems" do Gemini, de modo que seja lido como uma sublista dessa entrada, não como um painel colado.
- **Alternador de chevron.** Um pequeno botão `›` no lado direito da entrada Gems gira para `⌄` quando aberto. Clique para recolher/expandir. O estado é mantido em `chrome.storage.local` e sincronizado entre abas.
- **Zero tráfego de rede.** A lista é lida de um cache local que é preenchido na última vez que você visitou `https://gemini.google.com/gems/view`. Sem chamadas de API, sem polling, sem buscas em segundo plano.

## Como usar

1. Abra o popup do Voyager (ícone da extensão na barra de ferramentas).
2. Encontre o controle deslizante **Gems recentes na barra lateral**.
3. Arraste até o número desejado (1–10). **`0` oculta a seção completamente** — deixe aí se você não quer o recurso.

::: tip Primeira configuração
Após ativar, se você não vir nenhum gem, significa que o cache local está vazio. Visite `gemini.google.com/gems/view` uma vez — o Voyager tirará silenciosamente um snapshot da sua lista de gems. Na próxima vez que você estiver em qualquer página do Gemini, a lista estará lá.
:::

## Quando o cache é atualizado

O Voyager só atualiza o cache enquanto você está **ativamente em `/gems/view`**:

- Visitar a página, reordenar, renomear, criar, excluir um gem — tudo sincroniza com o cache em tempo real.
- Fora de `/gems/view`, nenhum scraping acontece.

Então, se você adicionar um gem de outro dispositivo, o Voyager não saberá "magicamente". Abra `/gems/view` uma vez nesta máquina e tudo sincronizará.

## Privacidade

- Os dados permanecem no **armazenamento local do navegador** (`chrome.storage.local`). Nada é enviado para lugar nenhum.
- Não lemos nem cacheamos o conteúdo das conversas do gem — apenas o nome, descrição, link e primeira letra para o avatar.
- Desativar o recurso (contagem = 0) deixa o cache no lugar, então reativar é instantâneo.

## Plataforma

Apenas Gemini (`gemini.google.com`). A entrada de gem do AI Studio tem uma forma diferente e não é coberta.
