---
title: Visualização Activity
description: Ordene as conversas das pastas pela atividade real, para que o trabalho que ainda está em andamento apareça primeiro.
---

# Activity: mantenha a atenção nas conversas em andamento

As pastas respondem a uma pergunta: onde esta conversa pertence? À medida que o seu acervo cresce, outra pergunta surge com mais frequência: no que devo prestar atenção agora?

Activity é uma visualização baseada em tempo sobre as suas pastas. Clique no sino ao lado de **Pastas** para substituir a árvore de pastas por conversas ordenadas pela atividade real do chat. Ela não altera as suas pastas, as atribuições das conversas nem o estado de Estrela.

**Inspiração de design:** esta visualização foi inspirada na barra lateral do Codex / ChatGPT Desktop, da OpenAI. O Voyager aproveita a ideia de destacar conversas que continuam ativas e a adapta para uma visualização baseada em tempo sobre as pastas do Gemini.

<img src="/assets/activity-view.png" alt="A visualização de atenção Activity na barra lateral do Gemini" style="display: block; width: 100%; max-width: 517px; margin: 24px auto; border-radius: 14px; box-shadow: 0 12px 32px rgba(0,0,0,0.12);"/>

## A prioridade segue a atividade recente

Prioridade contém conversas com um novo turno nas últimas **três horas**. Ela usa o horário real da conversa, não o momento em que você abriu ou viu o chat.

Uma conversa em Prioridade não aparece também em Hoje. Quando a janela de atividade de três horas termina, Activity a devolve automaticamente para Hoje ou para o grupo de data correspondente. Você não precisa atualizar a página.

Estrela continua disponível como marcação manual separada. Marcar uma conversa com estrela não a move para Prioridade, e remover a estrela não tira uma conversa ativa de Prioridade.

## Uma janela curta sobre os últimos dias

Abaixo de Prioridade, Activity mostra Hoje, Ontem e os dias da semana anteriores como títulos. A visualização cobre hoje e os quatro dias corridos anteriores, mantendo a lista próxima do trabalho atual.

Conversas mais antigas e entradas antigas sem horário de atividade não aparecem aqui. Elas não são ocultadas nem apagadas. Clique no sino de novo para voltar à árvore de pastas e encontrá-las no local original.

## Uma conversa, uma linha

Uma conversa pode pertencer a mais de uma pasta. Activity reúne essas referências em uma única linha e mantém os nomes das pastas abaixo do título. Passe o mouse sobre o contexto das pastas para ver os caminhos completos.

Assim, uma mesma conversa não ocupa várias posições em Prioridade ou em Hoje, e o contexto dos projetos continua preservado.

## Três sinais com funções diferentes

| Sinal    | Origem                             | Pergunta que responde                     |
| -------- | ---------------------------------- | ----------------------------------------- |
| Pastas   | Projetos e temas que você organiza | Onde esta conversa pertence?              |
| Activity | O último turno real da conversa    | Que trabalho avançou recentemente?        |
| Estrela  | Uma marcação manual                | Quais conversas devem continuar marcadas? |

As pastas são úteis quando você precisa recuperar algo do acervo. Activity reduz o conjunto de opções toda vez que você volta ao Gemini. Comece por uma conversa que ainda tem impulso em Prioridade, continue por Hoje ou Ontem e depois volte à árvore completa de pastas quando precisar de material mais antigo.

## Onde funciona

Activity está disponível na barra lateral de pastas do Gemini e na seção de pastas do ChatGPT (parte do plugin de pastas integrado ao ChatGPT).
