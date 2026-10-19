# Pastas

Guarde as suas conversas em pastas na barra lateral: arraste uma para uma pasta e fica arquivada, encaixe pastas até três níveis e recupere as mesmas noutro computador.

<SiteSupport feature="folders" :labels="{ folders: 'Pastas na barra lateral', 'hide-filed': 'Ocultar conversas arquivadas', activity: 'Vista Activity', 'account-isolation': 'Isolamento de contas', projects: 'Pastas como projetos', 'ai-organize': 'Organizar com IA' }" />

Só em alguns sites:

- **Mover para pasta** no menu de conversa do próprio site: Gemini, ChatGPT, Claude
- Arrastar da tabela da Library para uma pasta: AI Studio
- Ícones de conversa conforme o tipo de Gem: Gemini

Um ✓ com círculo funciona logo após instalar o Voyager. Nos outros sites, abra a janela do Voyager nesse site e ative as pastas na área **Plugins**; na primeira vez, é pedido acesso ao site.

## Onde está

A secção de pastas fica por cima da lista de conversas, na barra lateral. Com a barra lateral fechada, as mesmas pastas continuam disponíveis num painel flutuante.

<img src="/assets/gemini-folders.png" alt="A secção de pastas na barra lateral" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-width: 320px;"/>

## Arquivar uma conversa

- **Arrastar**: arraste uma conversa da barra lateral para cima de uma pasta.
- **Menu da conversa**: nos sites que o permitem, abra o menu da conversa e escolha **Mover para pasta**.
- **Seleção múltipla**: prima longamente uma conversa dentro de uma pasta para selecionar várias e movê-las de uma vez. A barra lateral do AI Studio ainda não suporta seleção múltipla.

## Encaixar, mudar o nome e a cor

<img src="/assets/folders-nested-en.png" alt="Pastas encaixadas em três níveis" width="240" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);"/>

- As pastas vão até três níveis: uma pasta de topo pode ter mais dois níveis de subpastas.
- Faça duplo clique no nome de uma pasta para lhe mudar o nome.
- Com o botão direito numa pasta pode afixá-la, criar uma subpasta, mudar-lhe o nome, eliminá-la ou escolher uma de 7 cores.

<img src="/assets/folders-menu-en.png" alt="O menu de contexto de uma pasta e as suas cores" width="254" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);"/>

A roda dentada do cabeçalho das pastas muda a ordem das conversas (ordem manual ou abertas recentemente) e ajusta o tamanho do texto, o espaçamento das pastas e o recuo das subpastas; a opção **Espaçamento de pastas** da janela também o faz. No Safari para Mac, pode ser preciso atualizar a página para ver a alteração.

## Ocultar conversas arquivadas

Depois de pôr uma conversa numa pasta, pode tirá-la da lista principal para lá ficarem só as conversas em curso.

- No Gemini e no AI Studio, abra a janela → **Opções de Pasta** → **Ocultar conversas arquivadas**. Cada site guarda a sua própria definição; no AI Studio, ficam ocultas as linhas da tabela da Library.
- No Gemini e no AI Studio, na primeira vez que arquiva uma conversa, um cartão na secção de pastas oferece ativá-lo com um clique. Escolha **Agora não** e não volta a perguntar.
- Nos outros sites, o interruptor está nas definições do plugin de pastas, na área **Plugins** da janela, e vem desativado.
- Nada é eliminado: as conversas arquivadas continuam nas suas pastas, e pode desativar isto quando quiser.

## Importar e exportar

<img src="/assets/folders-transfer-en.png" alt="Importar e exportar pastas" width="190" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);"/>

O ícone de pasta do cabeçalho tem **Importar pastas** e **Exportar pastas**. Exportar guarda um ficheiro JSON; importar junta-o às pastas que já tem, por isso o que já organizou fica como está.

## Sincronização na nuvem

Todos os sites com pastas podem usar a [sincronização na nuvem](/pt/guide/cloud-sync) para ter as mesmas pastas noutro computador. As pastas de cada site são guardadas e sincronizadas em separado.

## Vista Activity

O sino do cabeçalho troca a árvore por uma vista Activity só de leitura; prima-o outra vez para voltar à árvore. Nunca move, copia nem reclassifica conversas.

- **Prioridade**: conversas com atividade real nas últimas 3 horas. Abrir ou ver uma conversa não conta.
- **Hoje, Ontem e dias da semana**: ordenadas pela última atividade real, com apenas hoje e os quatro dias anteriores.
- A estrela é uma marca manual à parte e não decide o que entra em Prioridade.
- Conversas mais antigas, ou sem hora conhecida, não entram na Activity e continuam nas suas pastas.
- Cada entrada mostra a sua pasta; uma conversa que está em várias pastas aparece só uma vez.

[Leia o guia completo da vista Activity](/pt/guide/activity-view)

## Isolamento de contas

O botão com forma de pessoa na barra lateral do Gemini mostra temporariamente só as conversas da conta Google atual; vem desativado. **Enable Hard Isolation**, em **Opções de Pasta** na janela, separa as pastas e os dados de sincronização por conta; depois de ativado, os dados já estão separados e o botão esconde-se sozinho.

<img src="/assets/current-user-only.png" alt="O botão com forma de pessoa" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-width: 200px;"/>

## Organizar com IA

Demasiadas conversas para organizar à mão? Deixe o Gemini propor um plano de pastas.

1. Abra a janela no Gemini e clique em **Organizar com IA** no fundo de **Opções de Pasta**. As conversas por arquivar e a estrutura atual de pastas são copiadas como um prompt. O prompt usa o seu idioma, tal como os nomes das pastas.
2. Cole o prompt no Gemini. Ele responde com um plano de pastas em JSON.
3. Clique em **Importar pastas** no cabeçalho, escolha **Ou colar JSON diretamente**, cole e clique em **Importar**. **Mesclar com pastas existentes** é a opção predefinida: só acrescenta pastas novas e novas atribuições, sem mexer nas que já tem.

<img src="/assets/ai-auto-folder.png" alt="O botão Organizar com IA na janela" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-width: 320px;"/>

## Pastas como projetos

Dê a uma pasta instruções para o primeiro turno e uma conversa nova arquiva-se sozinha nela depois da primeira mensagem. A ideia vem dos Claude Projects, mas o Voyager só acrescenta instruções do primeiro turno e arquivo automático; não é um espaço de trabalho com contexto partilhado.

1. Ative **Habilitar Pasta como Projeto** na janela.
2. Clique com o botão direito numa pasta e escolha **Definir instruções** ou **Editar instruções**.
3. Abra uma conversa nova do Gemini e escolha a pasta no seletor ao lado da caixa de texto.
4. Envie a primeira mensagem.

A seguir:

- Depois do primeiro envio, a conversa é arquivada nessa pasta.
- Se a pasta tiver instruções, o Voyager só as junta a esse primeiro envio. Sem instruções, a pasta serve de atalho para arquivar conversas novas.
- As conversas da mesma pasta **não** partilham memória nem leem o conteúdo umas das outras.
- O guardar automático do rascunho só mantém o que escreveu, nunca as instruções ocultas.

Para a largura da barra lateral, veja [Largura da barra lateral](/pt/guide/sidebar).
