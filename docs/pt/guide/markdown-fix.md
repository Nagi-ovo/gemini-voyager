# Correção de Renderização Markdown

A interface web do Gemini™ às vezes insere elementos HTML (como fontes de citações ou marcadores de destaque) no meio do texto, o que pode quebrar a sintaxe de negrito do Markdown (`**texto**`), fazendo com que o texto não seja exibido corretamente em negrito.

O Voyager possui um recurso de correção automática integrado que identifica e repara de forma inteligente essas tags de negrito quebradas, garantindo que seus documentos sejam renderizados de forma limpa e precisa.

> [!NOTE]
> Este plugin oficial está incluído no Voyager e vem ativado por predefinição. Clique no ícone da extensão na barra de ferramentas do navegador e use **Plugins** → **Correção da renderização Markdown** no pop-up para o ativar ou desativar. Ao desativá-lo, o conteúdo novo deixa de ser corrigido, mas as correções que já vê no ecrã mantêm-se. Recarregue a página para ver a formatação original do Gemini. Ao voltar a ativá-lo, a formatação da página atual é corrigida.

A exportação e a bifurcação de conversas continuam a funcionar com o plugin desativado, mas podem manter problemas de formatação do Gemini, como marcadores Markdown visíveis nos ficheiros exportados.
