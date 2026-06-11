# Barra de status de uso

O Gemini 2026 adicionou limites de uso às conversas, mas para ver quanto resta você precisa ir até a página completa `gemini.google.com/usage`.

O Voyager transforma seus limites **diário** e **semanal** em uma pequena **barra flutuante arrastável** que fica bem dentro da interface do chat — dê uma olhada quando quiser, sem sair da conversa.

![Barra de status de uso](/assets/gemini-usage-status.png)

## Como fica

Uma mini-barra compacta: uma insígnia do plano (ex.: `PRO`), duas barras de progresso finas (diária / semanal) com porcentagens, um botão de atualizar e um pequeno ícone que abre a página de uso nativa. Translúcida e discreta — fica fora do caminho da conversa.

## Como funciona

- **Arrastável + lembra o lugar**: pegue a barra em qualquer ponto e solte onde for melhor para você; a posição persiste entre recarregamentos, navegação e abas. Por padrão, fica centralizada logo acima da caixa de digitação.
- **Atualiza silenciosamente em segundo plano**: os dados se atualizam sozinhos — **você nunca precisa recarregar a página nem abrir `/usage`**. Ela atualiza alguns segundos depois que cada resposta termina (bem na hora em que seu uso muda), com um fallback conservador em ociosidade a cada poucos minutos.
- **Passe o cursor para detalhes**: passe o cursor sobre uma barra para ver o horário de reinício daquela cota; passe o cursor sobre a barra inteira para ver "Atualizado agora / Atualizado há X min".
- **Dois controles com propósito definido**:
  - **Atualizar ↻** — força uma atualização silenciosa imediata (ele gira e atualiza no lugar; **nunca navega**).
  - **Abrir ↗** — abre a página `/usage` nativa em uma nova aba. É a **única** coisa na barra que navega.

## Como usar

1. Abra o painel de configurações do Voyager (o ícone da extensão na barra de ferramentas do navegador).
2. Ative o botão **Barra de status de uso** (desativado por padrão).
3. A barra flutuante aparece na interface do chat na hora — arraste para onde quiser.

::: tip Funciona de imediato
Depois de ativada, o Voyager busca seu uso em segundo plano automaticamente — **você não precisa visitar `/usage` primeiro**. Se o Google um dia mudar sua API interna e os números pararem de chegar, basta abrir `gemini.google.com/usage` uma vez e o Voyager se recalibra com os valores reais exibidos naquela página.
:::

## Frequência de atualização e detecção

As atualizações são **orientadas a eventos**: a barra só atualiza depois que seu uso realmente muda (ou seja, depois que você envia uma mensagem), além de um fallback conservador em ociosidade — **sem polling agressivo**. Cada atualização é exatamente a mesma requisição que a própria página usa para buscar o uso, feita com sua própria sessão logada e em ritmo humano. O volume de requisições é mais ou menos "uma vez por turno de conversa", então o impacto na detecção do Google é desprezível.

## Privacidade

- Tanto os números de uso quanto a posição da barra são armazenados **apenas localmente** (`chrome.storage.local`) — nada é enviado para qualquer servidor.
- Ela nunca lê nem armazena em cache o conteúdo das conversas — apenas as duas porcentagens, os horários de reinício e o nome do plano.
- Desative o botão e a barra é removida; o cache permanece local, então reativar não exige recarregar.

## Plataforma

Apenas **Google Gemini** (`gemini.google.com`).
