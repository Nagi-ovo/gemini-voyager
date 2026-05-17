# Bifurcação de Conversa (Experimental)

O pensamento não deveria ser de sentido único. Em explorações complexas, frequentemente precisamos de voltar a um nó crucial e tentar diferentes possibilidades.

Com a funcionalidade de **Bifurcação de Conversa**, o Voyager permite-lhe expandir as suas ideias e explorar universos paralelos do seu chat.

## Como Funciona

> **⚠️ Nota**: Esta é uma funcionalidade experimental. Primeiro, precisa de a ativar clicando no ícone da extensão na barra de ferramentas do seu navegador para abrir o pop-up de configurações, e ativando o interruptor **"Ativar Bifurcação de Conversa"**.

Sempre que quiser seguir um caminho diferente, passe o rato sobre a sua pergunta e clique no botão **Bifurcar**:

![Bifurcação](/assets/branching.png)

O Voyager captura todo o contexto desde o início até esse ponto e mostra uma caixa de confirmação:

- Clique em **Fork**: o Voyager abre uma nova conversa e preenche automaticamente a caixa de entrada com o contexto capturado. Reveja-o e envie para criar o ramo.
- Clique em **Baixar MD**: o Voyager transfere um ficheiro Markdown com o contexto e abre uma nova conversa. Antes de terminar a contagem decrescente no canto inferior direito (em 2 minutos), arraste o ficheiro `.md` para a área de entrada do Gemini. A caixa de entrada fica pré-preenchida com um pequeno modelo que indica que o anexo é contexto da conversa anterior e deixa espaço para o seu novo pedido. Ao enviar, a nova conversa fica registada como ramo desse ponto.

Como o fluxo de anexos do Gemini não pode ser automatizado de forma fiável pela extensão, o modo MD exige que arraste o ficheiro manualmente. A dica da contagem decrescente mostra o tempo restante; depois de expirar, a ligação de bifurcação dessa tentativa deixa de ser criada.

O Voyager apenas regista a relação do ramo. Não elimina nem reescreve a conversa original.

Neste novo ramo, pode modificar livremente a sua pergunta e explorar diferentes direções sem se preocupar em danificar o seu histórico de chat original. Liberte a sua criatividade e curiosidade!
