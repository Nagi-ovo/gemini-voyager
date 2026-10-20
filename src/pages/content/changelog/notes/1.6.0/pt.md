> *«Nem todos os que vagueiam estão perdidos.» — J. R. R. Tolkien, A Sociedade do Anel*

### Novidades

- **O Safari ganha recursos nativos do macOS — e o app passa a se chamar Voyager**: a versão do Safari por download direto agora conecta sua WebExtension à sincronização nativa do Google Drive e iCloud e às notificações do macOS que, ao concluir uma resposta, abrem a conversa correta. Depois desta migração única, as próximas versões serão atualizadas via Sparkle. A exportação de imagens e a remoção de marca d'água voltaram a funcionar, e o backup do iCloud pode ser excluído pelo popup sem alterar os dados locais. O app hospedeiro foi renomeado de "Gemini Voyager" para "Voyager". ⚠️ **Se você for atualizar, siga o guia de migração uma vez antes de atualizar para não ficar com dois apps instalados.**
- **O modo de entrada Vim chega ao Claude e ao ChatGPT**: a caixa de mensagem agora suporta edição por teclado no estilo Vim além do Gemini.
- **Blocos de código longos recolhíveis**: blocos de código muito longos podem ser recolhidos com um botão para não ocuparem a tela enquanto você rola.
- **Busca apenas por pastas**: digite o prefixo `f:` (ou `folder:`) na busca para procurar apenas nomes de pastas, com um selo indicando quando esse modo está ativo.
- **Arquivos enviados indicados nas exportações**: ao exportar uma conversa, os arquivos que não são imagens que você anexou agora são listados pelo nome, para não perder esse contexto.
- **Escolha como ver as notas da versão**: deixe o Voyager abrir automaticamente as novidades após atualizar ou mostrar apenas um selo `NEW` até você querer vê-las.

### Correções

- **Remoção de marca d'água mais inteligente e abrangente**: suporta as variantes mais recentes de marca d'água do Gemini e mais tamanhos de logo (incluindo imagens pequenas e grandes reduzidas), tem sucesso em mais casos limítrofes e continua sendo executada apenas quando uma marca d'água é realmente detectada. As páginas do Notebook (NotebookLM) não são mais afetadas, o Safari volta a baixar a imagem sem marca d'água em tamanho real, e as falhas recorrem a um download normal.
- **Indicador de uso mais confiável**: funciona de forma consistente em navegadores Chromium (Chrome / Edge), não pula mais para um valor menor errado por dados desatualizados, mantém a contagem regressiva de redefinição após atualizar e mostra um link clicável quando não há dados.
- **Pastas mais robustas**: as atribuições de pasta sobrevivem à rolagem da barra lateral do Gemini (virtualização), clicar em uma conversa abre a correta, a renomeação usa a caixa de diálogo nativa do Gemini e se mantém sincronizada, e as importações não quebram mais sob contenção.
- **Os rascunhos ficam com a sua conversa**: um rascunho não enviado permanece na conversa em que você o digitou e não é sobrescrito ao trocar de chat.
- **O tour de boas-vindas não sai mais por acidente**: clicar na página durante o tour não o encerra — apenas um fechamento explícito ou Esc encerra.
- **O destaque agora é opcional**: se você nunca usou o destaque, ele agora começa desativado (os destaques existentes continuam ativos e seus dados não mudam).
- **Desempenho e mais**: inicialização de recursos mais rápida e menos memória em conversas longas, as configurações do popup rolam imediatamente, o Mermaid em tela cheia se limpa ao fechar, a prévia da linha do tempo permanece visível, a exportação lida com mensagens carregadas sob demanda, a validação de plugins bloqueia URLs remotas e de esquema de script, e o isolamento entre contas é mais robusto.
