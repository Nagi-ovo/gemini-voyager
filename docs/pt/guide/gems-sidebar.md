# Gems recentes na barra lateral

O redesign do Gemini em 2026 primeiro tirou os Gems do menu de configurações e depois recolocou discretamente uma entrada de navegação na barra lateral, mas ela é apenas um link que leva para `/gems/view`.

O Voyager permite que essa entrada nativa de Gems "se expanda" em uma lista dos seus gems, ali mesmo na barra lateral: primeiro os gems fixados e depois os que você usou por último.

## Como fica

- **Pendurado na entrada nativa de Gems.** Recuado para alinhar com o rótulo "Gems" do próprio Gemini, então parece uma sublista dessa entrada, e não um painel colado.
- **Botão de expandir.** Um pequeno botão `›` do lado direito da entrada de Gems gira para `⌄` quando aberto. Clique para recolher ou expandir. O estado é salvo localmente e sincronizado entre as abas.
- **Uso recente primeiro.** Abrir qualquer gem, seu ou um dos gems prontos do Google, o move para o topo da lista.
- **Gems fixados ficam no lugar.** Os gems fixados sempre vêm primeiro, na ordem em que você os fixou, e não contam no limite do controle deslizante.
- **Zero tráfego de rede.** Tudo vem do que o Voyager vê nas páginas que você abre. Sem chamadas de API, sem consultas periódicas, sem buscas em segundo plano.

## Como usar

1. Abra o popup do Voyager (ícone da extensão na barra de ferramentas).
2. Encontre o controle deslizante **Gems recentes na barra lateral**. Ele mostra 3 gems por padrão.
3. Arraste até a quantidade desejada (1 a 10). **`0` oculta a seção inteira**: defina esse valor se não quiser o recurso.

Para fixar um dos seus gems, abra `gemini.google.com/gems/view` e clique no botão de fixar na linha dele (**Pin to sidebar**). Clique de novo para desafixar.

::: tip Primeira configuração
A lista se preenche conforme você usa: abra um gem e ele aparece. Para ver gems que você não abriu recentemente, visite `gemini.google.com/gems/view` uma vez; o Voyager tira discretamente um snapshot da sua lista de gems ali.
:::

## Quando a lista é atualizada

- **Abrir um gem** (`/gem/<id>`) registra que ele foi usado por último.
- **Visitar `/gems/view`** atualiza o snapshot da sua lista de gems; reordenar, renomear, criar ou excluir um gem ali sincroniza imediatamente.
- Nada é lido de outras páginas.

Então, se você adicionar um gem em outro dispositivo, o Voyager não vai saber "magicamente". Abra-o, ou abra `/gems/view`, uma vez nesta máquina.

## Privacidade

- O snapshot da lista de gems e o histórico de uso recente ficam no **armazenamento local do navegador** (`chrome.storage.local`).
- O valor do controle deslizante e os IDs dos gems fixados são salvos junto com as outras configurações do Voyager no **armazenamento sincronizado do navegador**, então acompanham você entre dispositivos conectados ao mesmo perfil. Nomes e ícones nunca são sincronizados.
- Não lemos nem armazenamos em cache o conteúdo das conversas do gem: apenas o nome, a descrição, o link e a primeira letra do avatar.
- Desativar o recurso (quantidade = 0) mantém os dados locais, então reativá-lo é instantâneo.

## Plataforma

Somente Gemini (`gemini.google.com`). A entrada de gems do AI Studio tem outro formato e não é coberta.
