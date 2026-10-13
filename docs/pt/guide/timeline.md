# Viagem no Tempo

A Linha do Tempo do Voyager é um sistema visual de navegação para conversas no Gemini, Claude e ChatGPT. Ela mapeia cada mensagem do chat em um nó interativo no lado direito da tela, transformando conversas longas com IA em um mapa navegável em que você pode pular de um ponto a outro instantaneamente.

Conversas longas são bagunçadas. Você rola para cima, rola para baixo, perde o seu lugar.
O Voyager transforma a sua conversa em uma linha do tempo.

Nas configurações do Gemini, **Mostrar linha do tempo** controla a barra e os seus atalhos de navegação. Desativar essa opção mantém as estrelas e a hierarquia salvas. Os horários das mensagens seguem **Mostrar carimbos de data/hora das mensagens** de forma independente, então você pode mantê-los visíveis com a linha do tempo desativada.

## Veja a forma do seu chat

Olhe para o lado direito da tela.
Cada nó representa uma mensagem. A linha do tempo mostra o ritmo do seu diálogo.

## Navegação, resolvida.

- **Teletransporte**: Clique em um nó para pular instantaneamente para aquela mensagem.
- **Espiada**: Passe o mouse sobre um nó para ver o que há dentro sem sair do lugar.
- **Marcador**: Pressione e segure um nó para **Marcar com estrela**. É como um marcador de livro para a sua memória.
- **Níveis (Experimental)**: Clique com o botão direito em um nó para definir níveis (1 a 3) ou recolher os seus filhos. Ótimo para deixar conversas ramificadas mais claras.
- **Redimensionar**: Arraste a borda interna da linha do tempo para ajustar a largura.
- **Teclado**: Navegue na velocidade do pensamento. Padrão `j`/`k`, `gg`/`GG` para ir à primeira/última troca.

![Navegação na Linha do Tempo](/assets/teaser.png)

## Estrela: marque os seus avanços

Conversas longas escondem ouro. Marque com estrela os momentos que importam.

**Como funciona**: Pressione e segure (cerca de 0,5 s) qualquer nó da linha do tempo. Você verá o nó acender: aquela mensagem agora está marcada com estrela.

- Pressione e segure de novo para remover a estrela.
- Os nós com estrela continuam destacados para que você os encontre de relance.
- Veja todas as mensagens marcadas na **Biblioteca salva**: clique em **Ver biblioteca salva** no popup do Voyager ou abra-a pelo painel do Gerenciador de Prompts.

Pense nisso como fincar uma bandeira na conversa: o momento em que você teve um insight, recebeu a resposta perfeita ou quer retomar depois.

::: tip Dica Pro
As estrelas sincronizam entre dispositivos se você tiver a [Sincronização na Nuvem](/pt/guide/cloud-sync) ativada.
:::

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
