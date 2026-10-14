# Navegação na Linha do Tempo

O recurso de assinatura do Voyager. Uma maneira visual e espacial de navegar nas suas conversas.

Nas definições do Gemini, **Mostrar linha do tempo** controla a barra da linha do tempo e os seus atalhos de navegação. Desativar esta opção mantém as estrelas e a hierarquia guardadas. As horas das mensagens seguem separadamente **Mostrar carimbos de data/hora das mensagens**, pelo que podem continuar visíveis com a linha do tempo desativada.

## O Problema

As conversas de IA podem tornar-se longas. Muito longas.
O scroll é lento. "Cmd+F" é desajeitado. Perde o contexto.

## A Solução

Olhe para a direita do ecrã. Essa é a Linha do Tempo.
Cada ponto representa uma troca (a sua pergunta + a resposta do Gemini™).

### Interações

- **Hover (Passar o rato)**: Veja uma pré-visualização instantânea do que foi discutido naquele ponto. Sem clicar, sem scroll. Apenas espreite.
- **Clique**: Salte instantaneamente para essa mensagem. Teletransporte.
- **Destaque de Contexto**: Enquanto faz scroll, o ponto correspondente acende-se, para que saiba sempre onde está no "mapa".
- **Níveis (Experimental)**: Clique com o botão direito num ponto para definir níveis (1 a 3) ou recolher os seus filhos. Ótimo para tornar claras as conversas ramificadas.
- **Redimensionar**: Arraste a borda interna da linha do tempo para ajustar sua largura.

![Navegação na Linha do Tempo](/assets/teaser.png)

## Favoritos (Stars)

Pressione longamente (~0.5s) em qualquer ponto para o **Marcar com Estrela**.
Pontos com estrela tornam-se maiores e mais brilhantes. Use-os para marcar:

- O código final funcional.
- A melhor explicação de um conceito.
- O prompt que desbloqueou tudo.

**Como funciona**:

- Pressione longamente novamente para remover a estrela.
- Os pontos com estrela ficam destacados para que você os encontre de relance.
- Clique em **Ver biblioteca salva** no popup do Voyager, ou abra-a a partir do painel do Gerenciador de Prompts, para ver todas as mensagens marcadas num só lugar na **Biblioteca salva**.

Pense nisso como plantar uma bandeira na conversa — o momento de uma revelação, a resposta perfeita, ou o ponto de onde quer continuar depois.

::: tip Dica
As estrelas sincronizam entre dispositivos se tiver a [Sincronização na Nuvem](/pt/guide/cloud-sync) ativada.
:::

A Linha do Tempo transforma uma parede de texto plano num mapa estruturado de conhecimento.

## Deixe com boa aparência

Em **Opções da Linha do Tempo** no popup do Voyager:

- **Estilo da linha do tempo**: `Nós`, `Régua` ou `Compacto`.
- **Fixar painel de pré-visualização**: Mantém o painel de pré-visualização aberto ao lado da linha do tempo. A caixa de pesquisa dele filtra as mensagens enquanto você digita.
- **Linha do tempo arrastável**: Mova a linha do tempo para qualquer lugar da página. **Redefinir Posição da Linha do Tempo** a devolve ao lugar original.

## Ainda mais rápido com teclas

Não quer usar o mouse? Use o teclado.

**É como ativar o modo Vim no Gemini.**

### Atalhos padrão

- `k` - Pular para o nó anterior
- `j` - Pular para o próximo nó
- `gg` - Pular para a primeira troca
- `GG` - Pular para a última troca

### Personalize

Abra as configurações da extensão, clique em uma caixa de atalho e pressione a tecla que quiser.
Qualquer tecla, qualquer combinação. `n`/`p`? `,`/`.`? A escolha é sua.

**Modo Fluxo**: Pressionamentos rápidos entram em fila e são executados suavemente.
**Modo Pulo**: Resposta instantânea, velocidade máxima.

## Quando usar a linha do tempo

A linha do tempo é mais útil em conversas com mais de 10 mensagens, em que rolar fica ineficiente:

- **Sessões de pesquisa**: Você pediu ao Gemini para explorar um tema ao longo de 30+ trocas. A linha do tempo permite voltar à ideia-chave sem reler tudo.
- **Depuração de código**: Uma longa conversa de depuração em que a solução apareceu na troca 47. Marque com estrela e encontre depois em um clique.
- **Aprendizado e tutoria**: Estudar um tema complexo passo a passo. Use os níveis para recolher as seções que você já domina.
- **Revisão de brainstorming**: Revisar uma sessão criativa para extrair as melhores ideias. As estrelas marcam os momentos que valem a pena guardar.

## Linha do tempo versus rolagem manual

| Recurso                     | Sem a linha do tempo             | Com a Linha do Tempo do Voyager                          |
| --------------------------- | -------------------------------- | -------------------------------------------------------- |
| Encontrar uma mensagem      | Rolar para cima e para baixo     | Clicar em um nó ou pressionar j/k                        |
| Marcar momentos-chave       | Copiar e colar em notas externas | Pressionar e segurar para marcar, sincroniza com a nuvem |
| Ver a estrutura da conversa | Ler em sequência                 | Mapa visual mostra a forma completa de relance           |
| Navegação por teclado       | Não disponível no Gemini         | Estilo Vim com j/k, gg/GG, totalmente personalizável     |
| Navegar por 100+ mensagens  | Minutos de rolagem               | Salto instantâneo para qualquer ponto                    |
| Organizar threads longas    | Sem ferramentas integradas       | Níveis (1 a 3) e filhos recolhíveis                      |

## Navegadores compatíveis

A linha do tempo funciona no Google Gemini e, como plugins integrados, no Claude e no ChatGPT, nos navegadores Chrome, Edge, Firefox, Safari, Opera e Brave. Atalhos de teclado, estrelas e níveis funcionam da mesma forma em todas as plataformas. As mensagens com estrela são sincronizadas entre dispositivos quando a [Sincronização na Nuvem](/pt/guide/cloud-sync) está ativada.

A linha do tempo não está disponível no AI Studio. O DeepSeek tem um plugin opcional de linha do tempo no catálogo de plugins (ele vem desativado).
