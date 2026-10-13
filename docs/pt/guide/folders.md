# Pastas bem feitas

Por que organizar chats de IA é tão difícil?
Nós resolvemos isso. Criamos um sistema de arquivos para os seus pensamentos.

<div style="display: flex; gap: 20px; margin-top: 20px; flex-wrap: wrap; margin-bottom: 40px;">
  <div style="flex: 1; min-width: 300px; text-align: center;">
    <p><b>Gemini™</b></p>
    <img src="/assets/gemini-folders.png" alt="Pastas no Gemini" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);"/>
  </div>
  <div style="flex: 1; min-width: 300px; text-align: center;">
    <p><b>AI Studio</b></p>
    <img src="/assets/aistudio-folders.png" alt="Pastas no AI Studio" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);"/>
  </div>
</div>

## A física da organização

Simplesmente parece certo.

- **Arrastar e soltar**: Pegue um chat. Solte-o em uma pasta. É tátil.
- **Hierarquia aninhada**: Projetos têm subprojetos. Crie pastas dentro de pastas. Estruture do _seu_ jeito.
- **Espaçamento de pastas**: Ajuste a densidade vertical, de compacta a espaçosa.
  > _Nota: no Safari do Mac, os ajustes podem não ser em tempo real; atualize a página para ver o efeito._
- **Sincronização entre dispositivos**: Organize no seu desktop e use a [Sincronização na Nuvem](/pt/guide/cloud-sync) para ver as mesmas pastas no seu notebook.

## Dicas avançadas

- **Seleção múltipla**: Pressione e segure uma conversa para entrar no modo de seleção múltipla, depois selecione vários chats e mova todos de uma vez.
- **Renomear**: Clique duas vezes em qualquer pasta para renomeá-la.
- **Ícones**: Detectamos automaticamente o tipo de Gem (programação, criativo etc.) e atribuímos o ícone certo. Você não precisa fazer nada.

## Diferenças de recursos por plataforma

### Recursos comuns

- **Gerenciamento básico**: Arrastar e soltar, renomear, seleção múltipla.
- **Reconhecimento inteligente**: Detecta automaticamente os tipos de chat e atribui ícones.
- **Hierarquia aninhada**: Suporte a pastas dentro de pastas.
- **Sincronização na nuvem**: Faça backup e sincronize a estrutura de pastas com a [Sincronização na Nuvem](/pt/guide/cloud-sync).

#### Ocultar conversas arquivadas

Depois que um chat é guardado em uma pasta, ele está "resolvido", mas, por padrão, continua ocupando espaço na lista principal. Ative **Ocultar conversas arquivadas** no popup da extensão → **Opções de Pasta**, e a lista principal mostra apenas o que ainda está ativo. Um inbox zero de verdade para seus chats de IA.

- Na primeira vez que você guardar uma conversa em uma pasta, o Voyager mostra um pequeno cartão na própria área de pastas oferecendo a ativação com um clique. Dispense-o e não incomodaremos mais.
- Conversas arquivadas **nunca são excluídas**: continuam totalmente acessíveis dentro das pastas.
- No AI Studio, as conversas guardadas são ocultadas da tabela da Library. O Gemini e o AI Studio mantêm cada um a sua própria configuração.
- Altere a qualquer momento pelo popup.

### Exclusivo do Gemini

#### Cores personalizadas

Clique no ícone da pasta para personalizar a cor. Escolha entre 7 cores padrão ou use o seletor de cores para escolher qualquer cor.

<img src="/assets/folder-color.png" alt="Cores das pastas" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); margin-top: 10px; max-width: 600px;"/>

#### Isolamento de conta

O ícone de pessoa mostra temporariamente apenas os chats da conta Google atual e fica desativado por padrão. O Hard Isolation, nas opções de pastas, vai além: separa os dados de pastas e de sincronização na nuvem por conta. Quando o Hard Isolation está ativo, o filtro de pessoa fica redundante e é ocultado automaticamente.

<img src="/assets/current-user-only.png" alt="Isolamento de conta" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); margin-top: 10px; max-width: 600px;"/>

#### Organização automática com IA

Chats demais e preguiça de organizar? Deixe o Gemini pensar por você.

Um clique copia a estrutura atual das suas conversas. Cole-a no Gemini, e ele gera um plano de pastas pronto para importar: organização instantânea.

**Passo 1: copie a estrutura das suas conversas**

Na parte inferior da seção de pastas no popup da extensão, clique no botão **Organizar com IA**. Ele reúne automaticamente todas as conversas sem pasta e a estrutura de pastas existente, gera um prompt e o copia para a área de transferência.

<img src="/assets/ai-auto-folder.png" alt="Botão Organizar com IA" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-width: 400px;"/>

**Passo 2: deixe o Gemini organizar**

Cole o conteúdo da área de transferência em uma conversa com o Gemini. Ele vai analisar os títulos dos seus chats e gerar um plano de pastas em JSON.

**Passo 3: importe o resultado**

Clique em **Importar pastas** no menu do painel de pastas, selecione **Ou colar JSON diretamente**, cole o JSON que o Gemini devolveu e clique em **Importar**.

<div style="display: flex; gap: 16px; margin-top: 12px; flex-wrap: wrap; margin-bottom: 24px;">
  <div style="text-align: center;">
    <img src="/assets/ai-auto-folder-2.png" alt="Menu de importação" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-width: 240px;"/>
  </div>
  <div style="text-align: center;">
    <img src="/assets/ai-auto-folder-3.png" alt="Importação colando JSON" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-width: 400px;"/>
  </div>
</div>

- **Mesclagem incremental**: Usa a estratégia "Mesclar" por padrão: só adiciona novas pastas e atribuições e nunca destrói a sua organização existente.
- **Multilíngue**: O prompt usa automaticamente o idioma configurado, e os nomes das pastas também são gerados nesse idioma.

#### Pasta como projeto

Quer que novos chats já comecem com um pequeno preset de projeto? Transforme qualquer pasta em um projeto.
A ideia é inspirada no Claude Projects, mas o Voyager a implementa de forma mais leve: instruções da pasta para a primeira mensagem e arquivamento automático, e não um espaço de trabalho com contexto compartilhado.

1. Ative **Habilitar Pasta como Projeto** no popup da extensão.
2. Clique com o botão direito em uma pasta e escolha **Definir instruções** ou **Editar instruções**.
3. Abra um novo chat no Gemini, use o seletor de pastas ao lado da caixa de entrada e selecione essa pasta.
4. Envie a sua primeira mensagem.

O que acontece depois:

- A conversa é guardada automaticamente nessa pasta depois do primeiro envio.
- Se a pasta tiver instruções, o Voyager as coloca no início apenas nesse primeiro envio.
- Se a pasta não tiver instruções, ela continua funcionando como um atalho rápido para arquivar.
- Chats na mesma pasta **não** compartilham memória nem leem automaticamente o conteúdo uns dos outros.
- O salvamento automático do rascunho guarda apenas o texto que você digitou; as instruções ocultas não são restauradas na caixa de entrada.

### Exclusivo do AI Studio

- **Ajuste da barra lateral**: Arraste para redimensionar a largura da barra lateral.
- **Integração com a Library**: Arraste diretamente da sua Library para as pastas.

### ChatGPT

As pastas também chegam ao ChatGPT como um plugin integrado. Você ganha uma seção de pastas na barra lateral do ChatGPT, além do mesmo painel flutuante. Guarde uma conversa com **Mover para pasta** no menu dela ou arraste a sua linha para uma pasta. Importar, exportar e a visualização de Atividade também funcionam ali. Ative ou desative pela seção **Plugins** do popup.
