> _«Qualquer um pode cozinhar.» (Gusteau, 《Ratatouille》)_

### Novidades

- **Modelos de prompt**: escreva `{{nome}}` num prompt guardado e o Voyager pede esses valores antes de enviar. Os campos ficam dentro da frase a que pertencem, e o menu de barra usa o mesmo analisador.
- **Prompts enviados**: um prompt enviado deixa de encher a mensagem com o texto do modelo. Fica reduzido a uma cápsula com o seu nome — abra-a para ler o que foi mesmo enviado, com os valores que preencheu destacados, e o que escreveu continua visível nos dois estados.
- **Conclusão enquanto escreve**: depois de `/`, o resto do nome do prompt selecionado aparece para lá do cursor. Tab aceita, Enter insere o prompt.
- **Mudar um valor antes de enviar**: passe o rato sobre um prompt já inserido e edite o que preencheu, na própria pré-visualização.

### Correções

- **Sobras nas pastas**: apagar um chat no Gemini agora remove o item correspondente da pasta, sem deixar ligações mortas.
- **Posição de leitura** _(desativado por predefinição)_: com «Prevenir rolamento automático» ligado, uma resposta concluída já não o puxa para o fundo enquanto lê mais acima.
- **Largura do chat**: no novo esquema do Gemini, a largura do chat e a da caixa de edição ajustam-se em separado. A caixa de escrita deixa de ficar presa à largura do chat.
- **Botão de exportar do ChatGPT** _(desativado por predefinição)_: o botão de exportar já não cobre Partilhar nem o menu Mais no topo do ChatGPT.
- **Caixa de edição do Gemini**: no Safari e no Firefox os botões Cancelar e Atualizar voltam a ficar por baixo da caixa em vez de saltarem para a esquerda. Com o controlo de largura de edição ligado, a caixa deixa de ultrapassar essa linha.
- **Pré-visualização de prompts**: a pré-visualização ao passar o rato apresenta Markdown em vez de mostrar `#` e `-` em bruto, e segue o estilo do painel.
- **Cor de destaque dos prompts**: uma cor personalizada mantém a saturação e já não volta ao verde predefinido ao passar o rato.
- **Caixas de diálogo das pastas**: editar as instruções de uma pasta ou escolher o destino sobrevive à reconstrução da barra lateral do Gemini, sem perder o que escreveu.
- **Pastas no Firefox**: uma resolução de conta falhada é repetida, por isso o painel deixa de aparecer vazio e de descartar em silêncio as pastas que adiciona.
- **Posição da pré-visualização**: a pré-visualização do painel fica ao lado dele em vez de se deitar sobre a lista, e a de um prompt da caixa de escrita fica centrada logo acima dele.
- **Valores longos**: um valor longo passa à linha com a frase onde está, em vez de obrigar o cartão a deslizar na horizontal.
- **Superfícies da linha do tempo**: a pré-visualização e o menu de contexto da linha do tempo passam a usar a paleta e a tipografia do painel de prompts, e não o seu próprio azul escuro.
