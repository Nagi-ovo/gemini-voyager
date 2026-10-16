# Carimbo de Data/Hora

::: info
**Nota**: Esta funcionalidade está disponível na versão 1.3.7 e posteriores.
:::

O Voyager mostra a hora de envio de cada mensagem, ajudando-o a rastrear a linha temporal completa das suas conversas.

## Introdução

À medida que as conversas se prolongam, torna-se difícil lembrar quando uma discussão particular ocorreu.

O Voyager anota cada mensagem com um carimbo de data/hora preciso (formato: `AAAA-MM-DD HH:mm:ss`) acima da mensagem, e mostra a mesma hora ao passar o cursor sobre um ponto da linha do tempo.

## Como ativar

1. Abra o painel de configurações do Voyager (o ícone da extensão na barra de ferramentas do navegador).
2. Ative **Linha do tempo** → **Data e hora das mensagens** (marcado como **Experimental**, desativado por padrão).

No ChatGPT, ative **Plugins** → **ChatGPT · Linha do tempo** e, em **Opções**, ative **Mostrar carimbos de data/hora das mensagens**: é a mesma definição da linha do Gemini.

## De onde vêm as horas

- **Gemini**: O Voyager lê a hora real de envio de cada mensagem a partir dos próprios dados de conversa do Gemini, por isso as horas estão corretas mesmo em conversas feitas noutro dispositivo ou antes de instalar o Voyager. Só quando essa hora não está disponível é que o Voyager recorre à hora em que viu a mensagem pela primeira vez, guardada localmente no seu navegador.
- **ChatGPT**: O Voyager regista a hora de cada mensagem que envia enquanto a opção está ativada. Estas horas ficam guardadas localmente no seu navegador; as mensagens enviadas antes, ou a partir de outro dispositivo, não têm carimbo de data/hora.

## Características

- **Precisão ao segundo**: Data e hora completas, perfeito para rever conversas longas.
- **Zero distração**: A informação temporal é apresentada discretamente sem afetar a experiência de leitura.

## Casos de uso

- **Registos de trabalho**: Rever quando uma decisão particular foi tomada.
- **Notas de estudo**: Marcar quando um conceito foi discutido para revisão posterior.
- **Revisão de conversas longas**: Em conversas aprofundadas de vários dias, distinguir claramente as discussões de diferentes períodos.

## Plataforma

**Google Gemini** (`gemini.google.com`) e **ChatGPT** (`chatgpt.com`). Não disponível no Claude nem no DeepSeek.
