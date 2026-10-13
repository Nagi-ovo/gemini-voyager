# Barra de status de uso

O Gemini 2026 adicionou limites de uso às conversas, mas para ver quanto ainda resta é preciso ir até a página completa `gemini.google.com/usage`.

O Voyager transforma seus limites **diário** e **semanal** em uma pequena **barra flutuante arrastável** que fica dentro da própria interface do chat. Dê uma olhada quando quiser, sem sair da conversa.

![Barra de status de uso](/assets/gemini-usage-status.png)

## Como é

Uma mini-barra compacta: um selo do plano (por exemplo `PRO`), duas barras finas de progresso (diária e semanal) com porcentagens, um botão de atualizar e um pequeno ícone que abre a página nativa de uso. Translúcida e discreta, ela não atrapalha a conversa.

## Como funciona

- **Arrastável e lembra o lugar**: pegue a barra em qualquer ponto e solte onde preferir; a posição permanece entre recarregamentos, navegação e abas. Por padrão, ela fica centralizada logo acima da caixa de entrada.
- **Atualiza em silêncio, em segundo plano**: os dados se atualizam sozinhos. **Você nunca precisa recarregar a página nem abrir `/usage`**. Ela atualiza alguns segundos depois que cada resposta termina (justamente quando o seu uso muda), com um fallback conservador de ociosidade a cada poucos minutos.
- **Passe o mouse para ver detalhes**: passe o mouse sobre uma barra para ver o horário de reinício daquela cota; passe sobre a barra inteira para ver "Atualizado agora" ou "Atualizado há X min".
- **Dois controles com função específica**:
  - **Atualizar ↻**: força uma atualização imediata e silenciosa (o ícone gira e atualiza no lugar; **nunca navega**).
  - **Abrir ↗**: abre a página nativa `/usage` em uma nova aba. É a **única** coisa da barra que navega.

## Como usar

1. Abra o painel de configurações do Voyager (o ícone da extensão na barra de ferramentas do navegador).
2. Ative o botão **Barra de status de uso** (desativado por padrão).
3. A barra flutuante aparece imediatamente na interface do chat. Arraste-a para onde quiser.

::: tip Funciona logo de cara
Depois de ativado, o Voyager busca o seu uso automaticamente em segundo plano; **você não precisa visitar `/usage` antes**. Se o Google um dia mudar a API interna e os números deixarem de aparecer, basta abrir `gemini.google.com/usage` uma vez, e o Voyager se recalibra com os valores reais exibidos naquela página.
:::

## Frequência de atualização e detecção

As atualizações são **orientadas a eventos**: a barra só atualiza depois que o seu uso de fato muda (ou seja, depois que você envia uma mensagem), além de um fallback conservador de ociosidade. **Não há polling agressivo**. Cada atualização é a mesma requisição que a própria página usa para buscar o uso, feita com a sua sessão já logada e em ritmo humano. O volume de requisições fica em mais ou menos "uma vez por turno de conversa", então o impacto na detecção do Google é desprezível.

## Privacidade

- Tanto os números de uso quanto a posição da barra são armazenados **somente localmente** (`chrome.storage.local`). Nada é enviado a nenhum servidor.
- Ela nunca lê nem armazena em cache o conteúdo das conversas: apenas as duas porcentagens, os horários de reinício e o nome do plano.
- Ao desativar o botão, a barra é removida; o cache continua local, então reativar não exige recarregar a página.

## Plataforma

Somente **Google Gemini** (`gemini.google.com`).
