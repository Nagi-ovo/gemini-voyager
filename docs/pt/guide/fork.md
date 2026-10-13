# Ramificação de conversa (Experimental)

O pensamento não deveria ser uma via de mão única. Em explorações complexas, muitas vezes precisamos voltar a um ponto crucial e testar outras possibilidades.

Com o recurso **Ramificação de conversa**, o Voyager permite criar ramos a partir das suas ideias e explorar universos paralelos do seu chat.

## Como funciona

> **⚠️ Atenção**: Este é um recurso experimental. Primeiro, ative-o clicando no ícone da extensão na barra de ferramentas do navegador para abrir o popup de configurações e ligando a opção **Ativar ramificação de conversa**.

Sempre que quiser seguir outro caminho, passe o mouse sobre o seu prompt e clique no botão **Fork**:

![Ramificação de conversa](/assets/branching.png)

O Voyager captura todo o contexto desde o início até esse ponto e mostra uma caixa de confirmação. Escolha de acordo com o tamanho do contexto:

- **Baixar MD** (recomendado para a maioria das conversas): o campo de entrada do Gemini tem limite de tamanho, então um contexto longo pode não caber se for colado diretamente. O Voyager baixa um arquivo Markdown com o contexto e abre uma nova conversa; arraste o arquivo `.md` para o Gemini antes que a contagem regressiva de 2 minutos no canto inferior direito termine. O campo de entrada já vem preenchido com uma nota curta dizendo que o anexo é contexto da conversa anterior, deixando o espaço **New request:** para a sua próxima mensagem.
- **Fork** (melhor para conversas curtas): quando o contexto é curto, o Voyager abre uma nova conversa e preenche o campo de entrada diretamente; envie para criar o ramo.

Depois que você enviar, o Voyager apenas registra a relação do ramo. Ele não apaga nem reescreve a sua conversa original.

Nesse novo ramo, você pode modificar livremente a sua pergunta e explorar outras direções, sem medo de perder o histórico original do chat. Solte a sua criatividade e curiosidade!
