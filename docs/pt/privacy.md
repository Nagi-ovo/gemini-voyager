# Política de Privacidade

Última atualização: 16 de março de 2026

## Introdução

O Voyager ("nós", "nosso" ou "nos") está comprometido em proteger a sua privacidade. Esta Política de Privacidade explica como a nossa extensão de navegador recolhe, utiliza e protege as suas informações.

## Recolha e Utilização de Dados

**Não recolhemos nenhuma informação pessoal.**

O Voyager opera inteiramente dentro do seu navegador. Todos os dados gerados ou geridos pela extensão (como pastas, modelos de prompts, mensagens favoritas e configurações) são armazenados:

1. Localmente no seu dispositivo (`chrome.storage.local`)
2. No armazenamento sincronizado do seu navegador (`chrome.storage.sync`) se disponível, para sincronizar configurações entre os seus dispositivos.

Não temos acesso aos seus dados pessoais, histórico de chat ou qualquer outra informação privada. Não rastreamos o seu histórico de navegação.

## Sincronização com Google Drive (Opcional)

Se ativar explicitamente a função de sincronização com o Google Drive, a extensão utiliza a API Chrome Identity para obter um token OAuth2 (apenas com o scope `drive.file`) para fazer backup das suas pastas e prompts no **seu próprio Google Drive**. Esta transferência ocorre diretamente entre o seu navegador e os servidores da Google. Não temos acesso a estes dados e nunca são enviados para qualquer servidor que operemos.

## Permissões

A extensão solicita as permissões mínimas necessárias para funcionar:

- **Storage (Armazenamento)**: Para guardar as suas preferências, pastas, prompts, mensagens favoritas e opções de personalização da interface localmente e entre dispositivos.
- **Identity (Identidade)**: Para a autenticação Google da funcionalidade opcional de sincronização com o Google Drive. Usado apenas quando ativa explicitamente a sincronização na nuvem.
- **Scripting (Scripts)**: Para injetar dinamicamente scripts de conteúdo nas páginas do Gemini e em sites personalizados especificados pelo utilizador para a funcionalidade Gestor de Prompts. Apenas scripts incluídos na própria extensão são injetados — nenhum código remoto é obtido ou executado.
- **Host Permissions (Permissões de host)** (gemini.google.com, aistudio.google.com, etc.): Para injetar scripts de conteúdo que melhoram a interface do Gemini com funcionalidades como pastas, exportação, linha do tempo e citação de resposta. Os domínios adicionais da Google (googleapis.com, accounts.google.com) são necessários para a autenticação da sincronização com o Google Drive.
- **Optional Host Permissions (Permissões de host opcionais)** (todos os URLs): Apenas solicitadas em tempo de execução quando adiciona explicitamente sites personalizados para o Gestor de Prompts. Nunca ativadas sem a sua ação.

## Serviços de Terceiros

O Voyager não partilha nenhuns dados com serviços de terceiros, anunciantes ou fornecedores de análises.

## Alterações a Esta Política

Podemos atualizar a nossa Política de Privacidade ocasionalmente. Iremos notificá-lo de quaisquer alterações publicando a nova Política de Privacidade nesta página.

## Contacte-nos

Se tiver alguma dúvida sobre esta Política de Privacidade, por favor contacte-nos através do nosso [Repositório GitHub](https://github.com/Nagi-ovo/gemini-voyager).
