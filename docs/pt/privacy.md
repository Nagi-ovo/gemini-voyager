# Política de Privacidade

Última atualização: 14 de outubro de 2026

## Visão geral

O Voyager é uma extensão de navegador que funciona primeiro no seu dispositivo (local-first), feita para organizar e aprimorar os espaços de conversa com IA compatíveis. Ele processa uma quantidade limitada de dados do usuário, apenas para oferecer os recursos que você solicita. O Voyager não mantém um backend que recebe conversas, prompts, atividade de navegação, imagens ou identificadores de conta, e não usa rastreadores de publicidade nem de análise.

## Dados processados

Dependendo dos recursos que você usa, o Voyager pode processar:

- **Conteúdo de sites e comunicações pessoais**: texto de conversas, prompts, rascunhos, imagens, links e outros conteúdos das páginas compatíveis, usados para pastas, navegação, exportação, gerenciamento de prompts, pesquisa e recursos de interface.
- **Identificadores de conta**: um serviço compatível do Google pode expor o endereço de e-mail da conta conectada. O Voyager o converte em um identificador local da conta, para que os dados de contas diferentes continuem separados. O Voyager não envia o endereço de e-mail original para nenhum servidor.
- **Histórico da web e atividade do usuário**: URLs de sites compatíveis, rotas de conversas e eventos limitados de página, interação e rede necessários para navegação, atalhos, indicadores de uso, notificações de conclusão de resposta e outros recursos solicitados. Esses dados não são usados para criar perfis nem para publicidade.
- **Informações de autenticação**: um token OAuth2 com o escopo `drive.file`, somente quando você ativa explicitamente a sincronização com o Google Drive.
- **Dados e configurações da extensão**: pastas, modelos de prompts, rascunhos, mensagens favoritas, registros de uso, estado dos plugins e preferências de interface.

Esses dados são armazenados localmente em `chrome.storage.local` ou, para as configurações compatíveis, em `chrome.storage.sync`. Eles permanecem no seu dispositivo ou na conta de sincronização do navegador, a menos que você use explicitamente uma das transferências descritas abaixo.

## Transferências solicitadas pelo usuário

- **Sincronização com o Google Drive (opcional)**: os dados de backup selecionados são transferidos diretamente entre o seu dispositivo e o seu próprio Google Drive. Chrome, Edge e Firefox usam a API de identidade do navegador; o aplicativo Safari de distribuição direta usa o login nativo do Google e salva as credenciais no Keychain do macOS. Os dois caminhos solicitam apenas o escopo limitado `drive.file`, e os tokens OAuth não são enviados para nenhum servidor do Voyager.
- **Sincronização com o iCloud no Safari (opcional)**: os dados de backup selecionados são transferidos pela extensão nativa do Safari diretamente para o seu banco de dados privado do CloudKit, na sua conta do iCloud. O Voyager não recebe o seu Apple ID nem um token de autenticação do iCloud, e o desenvolvedor não tem acesso aos registros desse banco privado.
- **Exportações e imagens**: quando você pede uma exportação, o Voyager pode buscar imagens das fontes já hospedadas na própria página e pode solicitar o acesso temporário necessário para capturar o conteúdo de interface gerado. O arquivo resultante é criado para você; ele não é enviado para nenhum servidor do Voyager.
- **Recursos públicos do projeto**: o Voyager pode solicitar recursos públicos de lançamento, comunicados ou documentação. Essas solicitações não incluem conteúdo de conversas ou prompts.
- **Atualizações do catálogo de plugins**: em um site onde você ativou pelo menos um plugin, o Voyager pode buscar, por HTTPS, um arquivo de catálogo atualizado para esse site em `https://voyager.nagi.fun/catalog/hosts/<host do site>.json`, por exemplo `https://voyager.nagi.fun/catalog/hosts/chat.deepseek.com.json`. A verificação acontece quando uma página desse tipo é aberta ou quando a janela da extensão é aberta nela, e só se a última verificação for mais antiga que o intervalo escolhido por você (6 horas por padrão; 1 hora, 6 horas, 24 horas ou somente manual). Gemini e AI Studio usam apenas os plugins oficiais incluídos na extensão e nunca disparam uma solicitação. A solicitação é um GET simples que não envia cookies, identificadores de conta ou da extensão, nem conteúdo da página ou da conversa; como em qualquer solicitação web, o servidor vê o endereço IP de origem e o user agent do navegador, além do nome do site no caminho da URL. Nos sites com plugins, a janela da extensão oferece o interruptor "Atualizações online de plugins" e o seletor do intervalo de verificação; ambas as configurações ficam salvas no armazenamento sincronizado do navegador e são incluídas no backup de configurações. Com o interruptor desligado, o Voyager não entra em contato com o voyager.nagi.fun, a menos que você clique em "Verificar atualizações de plugins agora". Se a solicitação falhar ou o site não tiver arquivo de catálogo, continua em uso o registro de plugins incluído na extensão. Um catálogo baixado contém apenas CSS e JSON, que são validados e sanitizados antes do uso; nenhum JavaScript é baixado nem executado. Essa verificação é separada da verificação de comunicados, que tem configuração própria. O voyager.nagi.fun é uma hospedagem estática atrás de um proxy da Cloudflare; o projeto Voyager não registra nem mantém essas solicitações, e os metadados de conexão (endereço IP, User-Agent) são tratados pelos provedores de hospedagem, de acordo com as políticas de privacidade deles.

O Voyager não vende dados do usuário nem os transfere para publicidade, avaliação de crédito ou finalidades não relacionadas aos recursos da extensão voltados ao usuário.

## Permissões

- **Storage (armazenamento)**: salva dados e preferências da extensão localmente e, onde há suporte, pela sincronização do navegador. Chrome, Edge e Firefox também concedem `unlimitedStorage`, para que os dados locais não sejam cortados pela cota padrão do navegador; o Voyager ainda aplica o próprio limite de armazenamento. No Safari, essa permissão é opcional.
- **Identity (identidade)**: autentica a sincronização opcional com o Google Drive, depois de uma ação explícita sua. A sincronização com o iCloud no Safari usa a conta iCloud do Mac, em vez desta permissão do navegador.
- **Scripting (scripts)**: injeta apenas scripts incluídos na própria extensão nos sites compatíveis; nenhum JavaScript ou WebAssembly remoto é executado.
- **Active tab e declarative content (aba ativa e conteúdo declarativo)**: identifica o site compatível aberto por você e exibe os controles específicos desse site. O declarative content é usado apenas no Chrome e no Edge.
- **Alarms (alarmes)**: executa verificações periódicas de comunicados públicos de compatibilidade.
- **Notifications (notificações, opcional)**: solicitada somente quando você ativa as notificações de conclusão de resposta.
- **Host permissions (permissões de host)**: concedidas na instalação para Gemini, Gemini Enterprise e AI Studio, além dos domínios do Google necessários para as operações de Google Drive e de imagens que você solicita.
- **Optional host permissions (permissões de host opcionais)**: Claude, ChatGPT, DeepSeek e sites personalizados só são acessados depois que você ativa o Voyager ou um plugin para esse site e aprova o pedido de permissão do navegador. `<all_urls>` também pode ser solicitado temporariamente quando você escolhe uma exportação que captura o conteúdo de interface gerado; se a permissão for negada, a exportação continua sem essa captura.

## Retenção e controle pelo usuário

Os dados locais e os dados de sincronização do navegador permanecem até que você os exclua, limpe o armazenamento da extensão ou desinstale a extensão. Os backups na nuvem permanecem na conta do Google Drive ou do iCloud escolhida até que você os remova dessa conta. Você pode desativar os recursos opcionais e revogar o acesso opcional aos sites ou a autorização do Google pelas configurações do Voyager e do navegador.

## Uso limitado das APIs do Google

O uso e a transferência de informações recebidas das APIs do Google pelo Voyager seguem a Política de Dados do Usuário da Chrome Web Store, incluindo os requisitos de Uso Limitado.

## Alterações nesta política

Podemos atualizar esta Política de Privacidade conforme o Voyager mudar. A versão mais recente e a data da atualização serão publicadas nesta página.

## Fale conosco

Para dúvidas sobre privacidade, entre em contato pelo [Repositório do Voyager no GitHub](https://github.com/voyager-crew/voyager).
