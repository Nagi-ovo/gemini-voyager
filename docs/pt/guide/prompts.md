# Seus ativos intelectuais: biblioteca de prompts

Você cria um prompt perfeito. Ele resolve um problema complexo de código ou escreve um e-mail impecável.
Você joga fora?
Não. Você salva.

## O cofre de prompts

Este é o seu repositório pessoal de boas ideias.

### 1. Capture

Quando escrever algo ótimo, clique no botão flutuante do Voyager (ele fica ao lado da área de entrada por padrão, e você pode arrastá-lo para onde quiser) para abrir o **Gerenciador de Prompts**.
Agora ele faz parte do seu cofre.

### 2. Categorize

Adicione tags como `coding`, `email` ou `research` (separe-as com vírgulas).
Mantenha suas ferramentas afiadas e organizadas.

### 3. Use

Da próxima vez que precisar, não precisa digitar tudo de novo.
Abra o gerenciador, pesquise por tag ou palavra-chave e clique para inserir.
Um clique. Alavancagem infinita.

![Gerenciador de Prompts](/assets/gemini-prompt-manager.png)

## Lista compacta e notas

Quando os prompts se acumulam e a lista de cartões deixa de caber, o painel se adapta:

### Alternar visualização

O botão `≡ / ▦` à direita da barra de pesquisa alterna entre **Lista compacta** (padrão) e **Visualização confortável**.

- **Lista compacta**: um prompt por linha, cerca de 10 visíveis de uma vez; à direita ficam as tags, expandir, editar e excluir
- **Visualização confortável**: pré-visualização completa em Markdown, ideal para uma coleção pequena

### Nome obrigatório

O campo **Nome** no topo do formulário de adicionar ou editar dá a cada prompt um título curto e é obrigatório ao criar ou editar um prompt. Prompts antigos sem nome continuam disponíveis, mas precisarão de um nome na próxima vez que forem editados.

### Pré-visualização rápida ao passar o mouse

No modo compacto, passe o mouse sobre qualquer linha por **cerca de 250 ms** para ver o conteúdo completo em uma dica flutuante. Ela substitui a dica nativa `title` do navegador, que pode levar de 1 a 3 s para aparecer.

### Inserção rápida com barra

Na caixa de entrada de um chat, digite `/` seguido de parte do nome de um prompt. A lista mostra os nomes e as tags correspondentes; passe o mouse sobre um item para pré-visualizar o conteúdo completo e clique nele ou use `Tab` / `Enter` para selecioná-lo. O editor mostra o nome escolhido como um token destacado e envia o corpo completo do prompt.

![Visualização em lista compacta](/assets/gemini-prompt-manager-compact.png)

## Disponível em qualquer lugar

O Gerenciador de Prompts agora pode ser usado em qualquer site que você escolher, não só no Gemini™ e no AI Studio.

### Como ativar

No Claude, no ChatGPT e no DeepSeek, abra o popup do Voyager enquanto estiver no site e ative a chave do próprio site (por exemplo, **Ativar o Gerenciador de Prompts no Claude**). Você será solicitado a conceder acesso.

Para qualquer outro site:

1. Clique no ícone do Voyager na barra de extensões do navegador.
2. Role até a seção **Gerenciador de Prompts**.
3. Digite a URL do site (por exemplo, `chatgpt.com` ou `claude.ai`).
4. Clique em **Adicionar site** e conceda a permissão.
5. **Recarregue a página de destino** para ver o botão flutuante.

### Sites de IA populares

- `chatgpt.com` - ChatGPT
- `claude.ai` - Claude
- `copilot.microsoft.com` - Microsoft Copilot
- `poe.com` - Poe

### Aplicativos locais

Endereços locais também funcionam: digite `localhost:3080` ou `127.0.0.1:3080` do mesmo jeito. Por exemplo, o [DeepSeek Harness](/pt/guide/deepseek-harness) roda em `localhost:3080`, e o Gerenciador de Prompts se conecta a ele como a qualquer site hospedado.

![Gerenciador de Prompts rodando dentro do DeepSeek Harness](/assets/prompt-manager-deepseek-harness.png)

::: tip
Em sites que você adiciona por conta própria, **somente** o Gerenciador de Prompts é ativado. Recursos como Linha do Tempo e Pastas não são carregados ali. Claude, ChatGPT e DeepSeek são diferentes: eles recebem plugins oficiais próprios, que você pode conferir no [Mercado de plugins](/pt/plugins).
:::
