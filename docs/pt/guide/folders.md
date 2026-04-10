# Pastas Bem Feitas

Por que organizar chats de IA é tão difícil?
Nós resolvemos isso. Construímos um sistema de arquivos para seus pensamentos.

<div style="display: flex; gap: 20px; margin-top: 20px; flex-wrap: wrap; margin-bottom: 40px;">
  <div style="flex: 1; min-width: 300px; text-align: center;">
    <p><b>Gemini™</b></p>
    <img src="/assets/gemini-folders.png" alt="Pastas Gemini" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);"/>
  </div>
  <div style="flex: 1; min-width: 300px; text-align: center;">
    <p><b>AI Studio</b></p>
    <img src="/assets/aistudio-folders.png" alt="Pastas AI Studio" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);"/>
  </div>
</div>

## A física da organização

Simplesmente parece certo.

- **Arrastar e Soltar**: Pegue um chat. Solte-o em uma pasta. É tátil.
- **Hierarquia Aninhada**: Projetos têm subprojetos. Crie pastas dentro de pastas. Estruture do _seu_ jeito.
- **Espaçamento de pastas**: Ajuste a densidade da barra lateral, de compacto a espaçoso.
  > _Nota: No Mac Safari, os ajustes podem não ser em tempo real; atualize a página para ver o efeito._
- **Sincronização Instantânea**: Organize no seu desktop. Veja no seu laptop.

## Dicas Profissionais

- **Multi-Seleção**: Pressione e segure uma conversa para entrar no modo de multi-seleção, depois selecione vários chats e mova todos de uma vez.
- **Renomear**: Clique duas vezes em qualquer pasta para renomeá-la.
- **Ícones**: Detectamos automaticamente o tipo de Gem (Programação, Criativo, etc.) e atribuímos o ícone correto. Você não precisa fazer nada.

## Diferenças de recursos por plataforma

### Recursos comuns

- **Gestão básica**: Arrastar e soltar, renomear, seleção múltipla.
- **Reconhecimento inteligente**: Detecta automaticamente tipos de chat e atribui ícones.
- **Hierarquia Aninhada**: Suporte para aninhamento de pastas.
- **Adaptação para AI Studio**: Os recursos avançados estarão disponíveis em breve no AI Studio.
- **Sincronização com Google Drive**: Sincroniza a estrutura de pastas com o Google Drive.

### Exclusivo para Gemini

#### Cores personalizadas

Clique no ícone da pasta para personalizar sua cor. Escolha entre 7 cores padrão ou use o seletor de cores para escolher qualquer cor.

<img src="/assets/folder-color.png" alt="Cores das pastas" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); margin-top: 10px; max-width: 600px;"/>

#### Isolamento de conta

Clique no ícone "pessoa" no cabeçalho para filtrar instantaneamente os chats de outras contas do Google. Mantenha seu espaço de trabalho limpo ao usar várias contas.

<img src="/assets/current-user-only.png" alt="Isolamento de conta" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); margin-top: 10px; max-width: 600px;"/>

#### Organização Automática com IA

Chats demais, preguiça de organizar? Deixe o Gemini pensar por você.

Um clique copia sua estrutura de conversas atual, cole no Gemini, e ele gera um plano de pastas pronto para importar — organização instantânea.

**Passo 1: Copie sua estrutura de conversas**

Na parte inferior da seção de pastas no popup da extensão, clique no botão **AI Organize**. Ele coleta automaticamente todas as suas conversas não classificadas e a estrutura de pastas existente, gera um prompt e copia para a área de transferência.

<img src="/assets/ai-auto-folder.png" alt="AI Organize Button" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-width: 400px;"/>

**Passo 2: Deixe o Gemini classificar**

Cole o conteúdo da área de transferência em uma conversa do Gemini. Ele vai analisar os títulos dos seus chats e gerar um plano de pastas em JSON.

**Passo 3: Importe os resultados**

Clique em **Importar pastas** no menu do painel de pastas, selecione **Ou colar JSON diretamente**, cole o JSON que o Gemini retornou e clique em **Importar**.

<div style="display: flex; gap: 16px; margin-top: 12px; flex-wrap: wrap; margin-bottom: 24px;">
  <div style="text-align: center;">
    <img src="/assets/ai-auto-folder-2.png" alt="Import Menu" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-width: 240px;"/>
  </div>
  <div style="text-align: center;">
    <img src="/assets/ai-auto-folder-3.png" alt="Paste JSON Import" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-width: 400px;"/>
  </div>
</div>

- **Mesclagem incremental**: Usa a estratégia de "Mesclar" por padrão — apenas adiciona novas pastas e atribuições, nunca destrói sua organização existente.
- **Multilíngue**: O prompt usa automaticamente o idioma configurado, e os nomes das pastas também são gerados nesse idioma.

#### Pasta como Projeto

Quer que novas conversas já comecem com um pequeno preset de projeto? Transforme qualquer pasta num projeto.
A ideia é inspirada no Claude Projects, mas o Voyager implementa isso de forma mais leve: instruções baseadas em pasta para a primeira mensagem e arquivamento automático, não um workspace de contexto partilhado.

1. Ative `Habilitar Pasta como Projeto` no popup da extensão.
2. Clique com o botão direito numa pasta e escolha `Definir instruções` ou `Editar instruções`.
3. Abra um novo chat do Gemini, use o seletor de pastas ao lado da caixa de escrita e escolha essa pasta.
4. Envie a primeira mensagem.

O que acontece a seguir:

- A conversa é automaticamente colocada nessa pasta após o primeiro envio.
- Se a pasta tiver instruções, o Voyager prefixa essas instruções apenas nesse primeiro envio.
- Se a pasta não tiver instruções, continua a funcionar como atalho rápido de organização.
- Os chats na mesma pasta **não** partilham memória nem leem automaticamente o conteúdo uns dos outros.
- O auto-save de rascunhos guarda apenas o texto que escreveu; as instruções ocultas não voltam para a caixa de entrada.

### Exclusivo para AI Studio

- **Ajuste da barra lateral**: Arraste para redimensionar a largura da barra lateral.
- **Integração com Library**: Arraste diretamente de sua Library para pastas.
