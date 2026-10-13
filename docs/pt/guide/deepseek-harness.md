# DeepSeek Harness

O agente de programação de código aberto do próprio DeepSeek. Ele roda na sua máquina.

Ele tem uma interface web, em `localhost:3080`.

Uma interface web significa que o Voyager consegue acessá-la.

## Por que funciona

O Gerenciador de Prompts do Voyager não se importa com domínios. Ele se importa com os sites que você adicionou.

Um endereço local também é um site.

Por isso, o DeepSeek Harness não é diferente do Gemini, do Claude ou do ChatGPT: é apenas mais um lugar aonde os seus prompts podem acompanhar você.

## Três passos

### 1. Inicie o DSH

```bash
npm i -g @deepseek-ai/dsh
dsh web
```

Abra `http://localhost:3080` no navegador.

### 2. Ative a opção no popup

![Clique no ícone de quebra-cabeça na barra de ferramentas, clique em Voyager e ative o Gerenciador de Prompts em localhost:3080](/assets/dsh-enable-steps-en.png)

Como você já está em `localhost:3080`, o popup oferece a opção logo no topo. Ative-a e conceda o acesso.

Não precisa digitar o endereço.

### 3. Recarregue a página

O botão flutuante aparece no canto inferior direito.

![Gerenciador de Prompts rodando dentro do DeepSeek Harness](/assets/prompt-manager-deepseek-harness.png)

## Uma biblioteca, em todo lugar

Você não tem uma biblioteca separada por site. Você tem uma só, que acompanha você.

Cada prompt que você salvou no Gemini, no Claude ou no ChatGPT já está lá quando você abre o DSH, todos eles. Funciona também no sentido inverso: escreva um prompt dentro do DSH e ele estará esperando por você no Gemini.

As mesmas tags, os mesmos favoritos, a mesma pesquisa.

![Uma biblioteca alcançando todas as interfaces](/assets/one-prompt-library.png)

## Algumas observações

**A porta não é fixa.** O DSH ainda está em prévia para desenvolvedores, e a porta padrão pode mudar. Se mudar, basta adicionar a nova.

**Só o Gerenciador de Prompts é carregado.** Em um site personalizado como o DSH, a Linha do Tempo, as Pastas e o restante não são iniciados. (No site oficial do DeepSeek, muitos deles estão disponíveis como plugins oficiais.)

**Seus prompts nunca saem da máquina.** O DSH é local e a biblioteca do Voyager também é local. Nada nessa cadeia é enviado para fora.

::: tip
O mesmo método funciona para qualquer interface web local, como Open WebUI, LibreChat ou aquela que você mesmo escreveu. Adicione o endereço, recarregue a página, pronto.
:::
