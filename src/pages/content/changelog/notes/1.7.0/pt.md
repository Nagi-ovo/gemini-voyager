> _« Com olhos suficientes, todos os bugs saltam à vista. » — Eric S. Raymond, 《A Catedral e o Bazar》_

### Novidades

- **Insira prompts salvos com `/`**: digite `/` na caixa do Gemini para buscar seus prompts salvos pelo nome, pré-visualizar um e inseri-lo pelo teclado. Agora ele tem o próprio interruptor, então continua funcionando mesmo se você ocultar a bolha do gerenciador de prompts.
- **Dê nome aos interlocutores nas exportações**: substitua os rótulos padrão Usuário e IA pelos seus próprios nomes. A mudança vale para as exportações em Markdown, PDF e imagem, e fica salva.
- **Use seus prompts como títulos no Markdown** _(desativado por padrão)_: cada turno recebe como título a pergunta que você realmente fez, em vez de um número de turno genérico.
- **Diagnóstico anonimizado em um clique**: o popup pode gerar um relatório de diagnóstico sem conversas, contas ou links — copie em Markdown ou baixe em JSON ao relatar um problema.
- **A largura de leitura agora cobre os artefatos do Claude**: Claude · Largura de leitura confortável passa a valer também nos painéis de artefatos de documento do Claude. Se você já a tinha ativada, toque uma vez em "Conceder acesso ao site necessário" no gerenciador de plugins.
- **O popup lembra onde você estava**: ao reabri-lo, você volta ao mesmo ponto da lista de configurações em vez de pular para o topo.
- **Um instalador de Safari de verdade**: o download para macOS agora abre uma janela de instalação projetada — arraste o Voyager para Aplicativos, com o guia de atualização bem ali.

### Correções

- **Marcadores e estrelas ficam na mensagem certa**: a linha do tempo agora segue os identificadores de mensagem do próprio Gemini, então recarregar uma conversa longa não desloca mais estrelas, carimbos de hora, bifurcações ou destaques — e remover uma estrela não apaga mais o marcador errado.
- **Pasta de backup do Drive renomeada para Voyager Data**: uma pasta existente é renomeada no lugar — nada é movido, copiado ou excluído. O Voyager agora a encontra por um marcador oculto, então você pode renomeá-la ou movê-la para qualquer lugar do Drive sem quebrar a sincronização.
- **Prompts com nomes repetidos sobrevivem à importação e à sincronização**: prompts de mesmo nome não são mais descartados nem sobrescritos ao importar ou sincronizar pelo Drive, e as duplicatas são sinalizadas para você renomeá-las.
- **Nada de prompts em branco pelo atalho de envio**: com «Cmd/Ctrl+Enter para enviar» ativado, pressionar o atalho enquanto um arquivo ainda está sendo enviado não dispara mais um prompt vazio — ele aguarda o upload terminar.
- **Mermaid, em todas as frentes**: exportações em PDF e imagem agora contêm o diagrama renderizado em vez do código-fonte, os diagramas seguem o tema claro ou escuro do Gemini, eles renderizam quando a interface do Gemini está em japonês, coreano, árabe e outros idiomas, e deslizes comuns de sintaxe são corrigidos automaticamente.
- **Remoção de marca d'água mais confiável**: marcas d'água sobre fundos escuros e as difíceis de detectar agora são tratadas, e alternar a configuração passa a valer imediatamente nas abas do Gemini já abertas.
- **Pastas mais robustas**: uma barra lateral que some por um instante não deixa mais você preso em um painel flutuante com um botão que não fecha, e o painel de pastas não aparece mais duplicado.
- **O indicador de uso volta a atualizar**: um novo intervalo de uso adicionado pelo Gemini não faz mais toda a resposta ser descartada; o indicador atualiza a partir de qualquer conversa e mantém o escopo multiconta.
- **E mais**: as exportações de relatório do Deep Research voltaram ao menu, o isolamento de contas no Firefox não trava mais, os prompts com barra seguem sua cor de destaque, o painel de sincronização na nuvem mostra um cartão de plataforma mais claro, e o plugin da barra de uso do Claude foi aposentado.
