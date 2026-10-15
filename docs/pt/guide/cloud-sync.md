# Sincronização na Nuvem

A Sincronização na Nuvem do Voyager faz backup das suas pastas, da biblioteca de prompts, das mensagens marcadas com estrela e das configurações compatíveis. Escolha o Google Drive em qualquer navegador compatível, ou o iCloud no Safari. Os dados são transferidos diretamente entre o Voyager e a conta de nuvem pessoal que você selecionar; o Voyager não opera nenhum servidor de sincronização.

## O que é sincronizado

| Tipo de dado                   | Sincronizado | Detalhes                                                                                                  |
| ------------------------------ | ------------ | --------------------------------------------------------------------------------------------------------- |
| Estrutura de pastas            | Sim          | Pastas do Gemini, AI Studio e ChatGPT: aninhamento, cores e atribuições de conversas                      |
| Biblioteca de prompts          | Sim          | Todos os prompts salvos, com tags e organização em pastas                                                 |
| Mensagens com estrela          | Sim          | Marcadores da linha do tempo de qualquer conversa                                                         |
| Linha do tempo em outros sites | Sim          | Favoritos e níveis da linha do tempo no ChatGPT, Claude e DeepSeek                                        |
| Configurações da extensão      | Sim          | Preferências que valem em todos os dispositivos, como ordenação, cores e comportamento da entrada         |
| Configuração de plugins        | Sim          | Estado de instalação/ativação e configurações do plugin; as permissões de sites continuam por dispositivo |
| Respostas do modelo            | Não          | Os backups de estrelas contêm prompts do usuário, não respostas do modelo                                 |

## Dados com estrela e limites de sincronização

Os backups na nuvem incluem o **texto completo dos prompts de usuário que você marca com estrela** (até 16 KiB UTF-8 por prompt) no seu próprio Google Drive ou iCloud. Os backups de estrelas não armazenam respostas do modelo. O backup v1 mantém apenas prévias; o novo v2 inclui o texto e os registros de exclusão.

Os registros de exclusão são mantidos por 180 dias. Versões antigas do Voyager os ignoram e podem exibir ou reenviar estrelas excluídas; as novas bloqueiam cópias antigas com o mesmo carimbo de data e hora. Marcar novamente com uma data posterior, ou a expiração do registro, pode restaurar uma estrela. Longos períodos offline e diferenças nos relógios dos dispositivos também afetam as exclusões.

A sincronização mescla e verifica as gravações, com no máximo três tentativas, mas não é uma transação atômica entre dispositivos: uploads simultâneos ainda podem sobrescrever outras gravações. Uma sincronização posterior de um dispositivo que conserva os dados ausentes pode repará-los; sem ela, a recuperação não é garantida. Falhas parciais mantêm as gravações aceitas; sincronize novamente para concluir o reparo.

## Recursos

- **Sincronização entre dispositivos**: Mantenha suas configurações sincronizadas em vários computadores.
- **Privacidade de dados**: Os dados são armazenados diretamente no seu próprio Google Drive ou no banco de dados privado do iCloud, garantindo a privacidade sem nenhum servidor do Voyager.
- **Sincronização flexível**: Suporte para upload manual e download/mesclagem de dados.

::: info
Identificadores de dispositivo, tokens de acesso, caches, coordenadas da janela e estados temporários de execução não são sincronizados de propósito, pois são considerados personalização.
:::

## Como usar

1. Abra uma aba do Gemini, AI Studio ou ChatGPT e clique no ícone do Voyager na barra de ferramentas do navegador para abrir o popup. A seção **Sincronização na Nuvem** só aparece nesses sites, e as pastas de cada site são sincronizadas separadamente.
2. Localize a seção **Sincronização na Nuvem**.
3. No Safari, escolha **Google Drive** ou **iCloud**. Os outros navegadores usam o Google Drive.
4. Defina **Modo Sincr.** como **Manual**. O padrão é **Desativado**, e os botões de sincronização só aparecem no modo Manual.
5. Para o Google Drive no Safari, clique em **Conectar ao Google Drive** para entrar pelo app Voyager. Nos outros navegadores não há um botão de login separado: a janela de autorização do Google abre na primeira vez que você clica em **Enviar** ou **Mesclar**. Para o iCloud, verifique se o Mac está conectado ao iCloud.
6. Clique em **Enviar** para sincronizar seus dados locais com a nuvem, ou em **Mesclar** para trazer os dados da nuvem para este navegador. **Sobrescrever** substitui os dados locais pela cópia da nuvem em vez de mesclar, então tudo o que você ainda não enviou será perdido.

No iCloud, **Excluir backup do iCloud** remove todos os backups do Voyager no iCloud; os dados locais no Mac permanecem como estão.

### 💡 Sincronização rápida

A maneira mais fácil é clicar no ícone de nuvem no cabeçalho da área de pastas, na barra lateral esquerda, e escolher **"Enviar para nuvem"** ou **"Sincronizar da nuvem"** no menu.

<img src="/assets/cloud-sync.png" alt="Botões de sincronização rápida na nuvem" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); margin-top: 10px; width: 352px; max-width: 100%;"/>

::: warning
**Recomendação de segurança: Proteção dupla**\
Embora a sincronização na nuvem ofereça grande conveniência, recomendamos enfaticamente que você também faça backups periódicos dos seus dados principais usando **arquivos locais**.

1. **Pastas**: Abra o menu da área de pastas, escolha **Importar/Exportar pastas** e depois **Exportar pastas** para salvar todas as suas pastas e as atribuições de conversas.
2. **Prompts**: No Gerenciador de Prompts, clique em **Exportar** para salvar a sua biblioteca de prompts.
   :::

## Sincronização na nuvem versus backup manual

| Aspecto                    | Backup manual (Exportar/Importar)   | Sincronização na Nuvem                               |
| -------------------------- | ----------------------------------- | ---------------------------------------------------- |
| Frequência                 | Quando você lembrar                 | Sob demanda, com um clique                           |
| Local dos dados            | Arquivo local no seu computador     | Seu Google Drive ou banco de dados privado do iCloud |
| Entre dispositivos         | Exige transferir arquivos           | Dispositivos conectados à conta de nuvem escolhida   |
| Comportamento de mesclagem | Substitui ou exige mesclagem manual | Mesclagem inteligente, sem duplicar                  |
| Privacidade                | O arquivo fica na sua máquina       | Armazenado na sua conta de nuvem pessoal             |

## Como funciona

1. **Provedor**: O Google Drive usa a permissão limitada `drive.file`, então o Voyager só consegue acessar os arquivos que ele mesmo criou. No Safari, o iCloud usa o banco de dados CloudKit privado do app e não expõe ao Voyager nenhum token de ID da Apple.
2. **Envio**: Ao clicar em **Enviar**, o Voyager grava no provedor escolhido arquivos de backup separados para pastas, prompts, estrelas, forks, hierarquia da linha do tempo, configurações de personalização e configuração de plugins. Os dados de destaques são incluídos quando a sincronização de destaques está ativada.
3. **Baixar e mesclar**: Ao clicar em **Mesclar** em outro dispositivo, o Voyager lê esses arquivos e os mescla por tipo de dado. Novas pastas e prompts são adicionados sem duplicação, as preferências da nuvem são restauradas e as entradas de plugins são mescladas pelo ID do plugin.
4. **Sem sincronização em segundo plano**: A sincronização é manual e sob demanda. O Voyager nunca sincroniza sem a sua ação explícita.

Trocar de provedor não copia dados entre eles nem grava em ambos. Depois de trocar, envie uma vez se quiser que os dados locais atuais fiquem no novo provedor escolhido.

## Plataformas compatíveis

A sincronização com o Google Drive funciona no Chrome, Edge, Firefox e Safari. A sincronização com o iCloud está disponível apenas no app do Safari distribuído diretamente e usa a conta do iCloud conectada no Mac.
