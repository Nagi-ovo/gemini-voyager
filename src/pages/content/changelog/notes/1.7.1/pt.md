> _«Attention is all you need.» — Vaswani et al., 《Attention Is All You Need》(2017)_

### Novidades

- **Linha do tempo régua** _(desativado por padrão)_: um terceiro estilo de linha do tempo cujos traços crescem em torno de onde você está lendo, com prévia da pergunta e da resposta ao passar o cursor. Troque em «Estilo da linha do tempo» na janela da extensão.
- **Visão de atividade** _(desativado por padrão)_: clique no sino ao lado de Pastas na barra lateral do Gemini para trocar a árvore de pastas por uma lista em ordem de tempo — Prioritário (resposta nova nas últimas 3 horas), Hoje, Ontem — e ver num relance qual conversa retomar. [→ Documentação](/guide/activity-view) ![Visão de atividade](https://github.com/voyager-crew/voyager/raw/main/docs/public/assets/promotion/Activity-View.png)
- **Gerenciador de prompts em sites com porta**: adicione sites de conversa auto-hospedados como `localhost:3000` como sites personalizados.
- **Largura da barra lateral pelo menu de pastas** _(desativado por padrão)_: ajuste ali mesmo, sem abrir a janela da extensão.
- **A busca de configurações lembra sua última consulta**: ao reabrir a janela, o campo de busca recupera o que você digitou por último.

### Correções

- **A navegação pela linha do tempo para de travar**: depois que o Gemini reconstrói sua área de rolagem, os pontos da linha do tempo, a lista de prévia e os atalhos `j`/`k` continuam indo para a mensagem certa.
- **A prévia compacta sobrevive ao vão**: mover o ponteiro do trilho até o painel de prévia não o fecha mais, e os itens dentro dele voltam a ser clicáveis.
- **Os botões do cabeçalho voltam a responder**: com a largura de conversa ativada, uma área invisível ao redor do logo do Gemini não bloqueia mais os botões de fechar a barra lateral, conversa temporária e os demais.
- **A camada de soltar arquivos acompanha a largura do seu campo**: a área azul agora cobre o campo alargado em vez de parar na largura padrão do Gemini.
- **Copiar fórmulas volta a funcionar no ChatGPT**: o ChatGPT mudou como desenha as fórmulas e a cópia deixava de fazer nada; fórmulas em bloco também recebem os delimitadores corretos. Plugins que ficavam inativos no Edge depois de conceder acesso ao site agora ativam na hora.
- **Mais marcas d'água removidas**: mais imagens do Gemini em tamanho original saem limpas, e o selo 🍌 aparece assim que há um botão de download, sem esperar o motor carregar.
- **Um aviso quando o Google devolve uma imagem quebrada**: se o original baixado não corresponder à prévia na tela — borrado ou cortado —, o Voyager avisa e deixa claro que não foi a causa.
- **E mais**: o campo de busca das configurações não mostra mais dois botões de limpar, a preferência do selo de atualização foi para as Opções gerais onde a busca a encontra, o guia do Claude não cobre mais um artefato aberto, e o interruptor para ocultar Pastas foi removido — o que você tinha oculto volta recolhido.
