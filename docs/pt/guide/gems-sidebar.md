# Gems recentes na barra lateral

A nova barra lateral do Gemini moveu os Gems para o menu «Mais», onde eles são só um link para a página completa `/gems/view`. O Voyager adiciona à barra lateral sua própria seção Gems, com seus gems a um clique: primeiro os gems fixados, depois os que você usou mais recentemente.

## Como fica

- **Uma seção Gems própria.** A lista fica abaixo da navegação superior da barra lateral (o grupo com «Mais»), sob um cabeçalho **Gems**. Se o Gemini ainda mostrar uma entrada nativa de Gems, a lista fica abaixo dessa entrada.
- **Recolhível.** Clique no cabeçalho **Gems** (ou no chevron de uma entrada nativa de Gems) para recolher ou expandir; o `›` gira para `⌄` quando aberto. O estado é salvo localmente e sincronizado entre abas.
- **Uso recente primeiro.** Abrir qualquer gem — seu ou um dos gems prontos do Google — o move para o topo da lista.
- **Gems fixados ficam no lugar.** Os gems fixados sempre vêm primeiro, na ordem em que você os fixou, e não contam no limite do controle deslizante.
- **Zero tráfego de rede.** Tudo vem do que o Voyager vê nas páginas que você abre. Sem chamadas de API, sem polling, sem buscas em segundo plano.

## Como usar

1. Abra o popup do Voyager (ícone da extensão na barra de ferramentas).
2. Confirme que **Barra lateral** → **Gems recentes na barra lateral** está ativado (vem ativado por padrão). Enquanto estiver ativado, um controle deslizante de quantidade aparece abaixo da linha; ele mostra 3 gems por padrão.
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
- Desativar a linha deixa os dados locais no lugar, então reativá-la é instantâneo.

## Plataforma

Apenas Gemini (`gemini.google.com`). A entrada de gem do AI Studio tem uma forma diferente e não é coberta.
