# Gems recentes na barra lateral

::: info Indisponível no momento
A nova barra lateral do Gemini moveu os Gems para o menu «Mais» e não tem mais uma entrada de Gems. Por enquanto, este recurso não aparece, e seu botão no popup do Voyager está desativado e em cinza.
:::

O redesign do Gemini 2026 primeiro moveu os Gems para trás do menu de configurações e depois colocou silenciosamente uma entrada de navegação no topo da barra lateral — mas é apenas um link que te leva para `/gems/view`.

O Voyager faz com que essa entrada nativa de Gems "se expanda" em uma lista dos seus gems, diretamente na barra lateral: primeiro os gems fixados, depois os que você usou mais recentemente.

## Como fica

- **Pendurado abaixo da entrada nativa de Gems.** Indentado para se alinhar com o rótulo "Gems" do Gemini, de modo que seja lido como uma sublista dessa entrada, não como um painel colado.
- **Alternador de chevron.** Um pequeno botão `›` no lado direito da entrada Gems gira para `⌄` quando aberto. Clique para recolher/expandir. O estado é salvo localmente e sincronizado entre abas.
- **Uso recente primeiro.** Abrir qualquer gem — seu ou um dos gems prontos do Google — o move para o topo da lista.
- **Gems fixados ficam no lugar.** Os gems fixados sempre vêm primeiro, na ordem em que você os fixou, e não contam no limite do controle deslizante.
- **Zero tráfego de rede.** Tudo vem do que o Voyager vê nas páginas que você abre. Sem chamadas de API, sem polling, sem buscas em segundo plano.

## Como usar

1. Abra o popup do Voyager (ícone da extensão na barra de ferramentas).
2. Confirme que **Plugins** → **Gems recentes na barra lateral** está ativado (vem ativado por padrão). Enquanto estiver ativado, um controle deslizante de quantidade aparece abaixo da linha; ele mostra 3 gems por padrão.
3. Arraste até o número desejado (1–10). **`0` apenas oculta a lista de Gems recentes**; não desativa o recurso. Para desativá-lo, desligue a chave da linha.

Para fixar um dos seus gems, abra `gemini.google.com/gems/view` e clique no botão de fixar na linha dele (**Pin to sidebar**). Clique de novo para desafixar.

::: tip Primeira configuração
A lista vai se preenchendo conforme você usa: abra um gem e ele aparece. Para ver gems que você não abriu recentemente, visite `gemini.google.com/gems/view` uma vez — o Voyager tirará silenciosamente um snapshot da sua lista de gems ali.
:::

## Quando a lista é atualizada

- **Abrir um gem** (`/gem/<id>`) o registra como recém-usado.
- **Visitar `/gems/view`** atualiza o snapshot da sua lista de gems; reordenar, renomear, criar, excluir um gem ali — tudo sincroniza na hora.
- Nada é lido de outras páginas.

Então, se você adicionar um gem de outro dispositivo, o Voyager não saberá "magicamente". Abra-o, ou abra `/gems/view`, uma vez nesta máquina.

## Privacidade

- O snapshot da lista de gems e o histórico de uso recente permanecem no **armazenamento local do navegador** (`chrome.storage.local`).
- O valor do controle deslizante e os IDs dos gems fixados são salvos junto com as outras configurações do Voyager no **armazenamento sincronizado do navegador**, então te acompanham entre dispositivos conectados ao mesmo perfil do navegador. Nomes e ícones nunca são sincronizados.
- Não lemos nem cacheamos o conteúdo das conversas do gem — apenas o nome, descrição, link e primeira letra para o avatar.
- Desativar o recurso (contagem = 0) deixa os dados locais no lugar, então reativar é instantâneo.

## Plataforma

Apenas Gemini (`gemini.google.com`). A entrada de gem do AI Studio tem uma forma diferente e não é coberta.
