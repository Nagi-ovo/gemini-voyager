# Sincronização na Nuvem

Sincronize suas pastas, biblioteca de prompts e outros dados no Google Drive para manter sua experiência consistente em todos os seus dispositivos.

## Recursos

- **Sincronização entre dispositivos**: Mantenha suas configurações sincronizadas em vários computadores usando o Google Drive.
- **Privacidade de dados**: Os dados são armazenados diretamente no seu próprio armazenamento do Google Drive, garantindo a privacidade sem servidores de terceiros.
- **Sincronização flexível**: Suporte para upload manual e download/mesclagem de dados.

## Dados com estrela e limites de sincronização

Os backups na nuvem incluem o **texto completo dos prompts de usuário que você marca com estrela** (até 16 KiB UTF-8 por prompt) no seu próprio Google Drive ou iCloud. Os backups de estrelas não armazenam respostas do modelo. O backup v1 mantém apenas prévias; o novo v2 inclui o texto e os registros de exclusão.

Os registros de exclusão são mantidos por 180 dias. Versões antigas do Voyager os ignoram e podem exibir ou reenviar estrelas excluídas; as novas bloqueiam cópias antigas com o mesmo carimbo de data e hora. Marcar novamente com uma data posterior, ou a expiração do registro, pode restaurar uma estrela. Longos períodos offline e diferenças nos relógios dos dispositivos também afetam as exclusões.

A sincronização mescla e verifica as gravações, com no máximo três tentativas, mas não é uma transação atômica entre dispositivos: uploads simultâneos ainda podem sobrescrever outras gravações. Uma sincronização posterior de um dispositivo que conserva os dados ausentes pode repará-los; sem ela, a recuperação não é garantida. Falhas parciais mantêm as gravações aceitas; sincronize novamente para concluir o reparo.

## Como usar

1. Clique no ícone da extensão no canto inferior direito da página do Gemini™ para abrir o painel de configurações.
2. Localize a seção **Sincronização na Nuvem**.
3. Clique em **Fazer login com o Google** e conclua a autorização.
4. Uma vez autorizado, clique em **Fazer upload para a nuvem** para sincronizar seus dados locais com a nuvem, ou em **Baixar e mesclar** para trazer os dados da nuvem para sua máquina local.

### 💡 Sincronização rápida

A maneira mais fácil é clicar nos botões **"Fazer upload para a nuvem"** ou **"Baixar e mesclar"** na parte superior da área de pastas na barra lateral esquerda.

<img src="/assets/cloud-sync.png" alt="Botões de sincronização rápida na nuvem" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); margin-top: 10px; max-width: 600px;"/>

::: warning
**Recomendação de segurança: Proteção dupla**  
Embora a sincronização na nuvem ofereça grande conveniência, recomendamos enfaticamente que você também faça backups periódicos dos seus dados principais usando **arquivos locais**.

1. **Exportação Completa**: Exporte um pacote completo contendo todas as configurações, pastas e prompts em "Backup e Restauração" na parte inferior do painel.
   <img src="/assets/manual-export-all.png" alt="Exportação Completa" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); margin-top: 10px; max-width: 600px;"/>
2. **Exportar Todas as Pastas**: Clique em "Exportar" na seção "Pastas" do painel para fazer backup de todas as suas pastas e conversas, excluindo os prompts.
   <img src="/assets/manual-folder-export.png" alt="Exportar Todas as Pastas" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); margin-top: 10px; max-width: 600px;"/>
   :::
