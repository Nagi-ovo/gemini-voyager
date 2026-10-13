# Instalação

::: info Novidades
🍎 **A extensão nativa do Safari foi lançada!** É totalmente gratuita e permite instalação com um clique.
:::

Escolha o seu caminho.

> ⚠️ Nota: o Gerenciador de Prompts é o único recurso compatível com o Gemini™ para Enterprise.

## 1. Lojas de extensões (recomendado)

A forma mais simples de começar. As atualizações são automáticas.

**Chrome / Edge / Brave / Opera / Vivaldi:**

[<img src="https://img.shields.io/badge/Chrome_Web_Store-Download-4285F4?style=for-the-badge&logo=google-chrome&logoColor=white" alt="Instalar pela Chrome Web Store" height="40"/>](https://chromewebstore.google.com/detail/iifacdnjakkhjjiengaffnegbndgingi?utm_source=github&utm_medium=docs&utm_campaign=organic_growth&utm_content=pt)

**Microsoft Edge:**

[<img src="https://img.shields.io/badge/Microsoft_Edge-Download-0078D7?style=for-the-badge&logo=microsoft-edge&logoColor=white" alt="Instalar pelo Microsoft Edge Add-ons" height="40"/>](https://microsoftedge.microsoft.com/addons/detail/voyager/gibmkggjijalcjinbdhcpklodjkhhlne)

> **Usuários do Edge:** o Voyager continua sendo mantido no [Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/voyager/gibmkggjijalcjinbdhcpklodjkhhlne), principalmente para quem precisa do Edge no celular ou no tablet. Se a análise atrasar, a Chrome Web Store e os pacotes manuais no GitHub continuam disponíveis.

**Firefox:**

[<img src="https://img.shields.io/badge/Firefox_Add--ons-Download-FF7139?style=for-the-badge&logo=firefox&logoColor=white" alt="Instalar pelo Firefox Add-ons" height="40"/>](https://addons.mozilla.org/firefox/addon/gemini-voyager/)

## 2. O caminho manual (recursos mais recentes)

A análise da loja de extensões pode demorar. Se você quer a versão mais recente imediatamente, instale manualmente.

**Para Chrome / Edge / Brave / Opera:**

1. Baixe o `voyager-chrome-vX.Y.Z.zip` mais recente em [GitHub Releases](https://github.com/voyager-crew/voyager/releases).
2. Descompacte o arquivo.
3. Abra a página de extensões do navegador (`chrome://extensions`).
4. Ative o **Modo do desenvolvedor** (canto superior direito).
5. Clique em **Carregar sem compactação** e selecione a pasta que você acabou de descompactar.

**Para Firefox:**

1. Baixe o `voyager-firefox-vX.Y.Z.xpi` mais recente em [Releases](https://github.com/voyager-crew/voyager/releases).
2. Abra o Gerenciador de Complementos (`about:addons`).
3. Arraste e solte o arquivo `.xpi` para instalar (ou clique no ícone de engrenagem ⚙️ -> **Instalar complemento de arquivo**).

> 💡 O arquivo XPI é assinado oficialmente pela Mozilla e pode ser instalado permanentemente em todas as versões do Firefox.

## 3. Safari (macOS)

O Safari agora suporta distribuição direta! Baixe o app pré-assinado:

::: warning Atualizando a partir do `Gemini Voyager.app`
O app que contém a extensão agora se chama `Voyager.app`. Como o macOS não substitui apps com nomes de arquivo diferentes, não deixe as duas cópias instaladas.

1. Na extensão antiga, abra as abas do Gemini e do AI Studio que você usa e execute **Sincronização na Nuvem > Enviar para nuvem**. Se você usa destaques sincronizados, ative a sincronização de destaques antes de enviar.
2. Exporte a biblioteca de prompts como arquivo JSON local, como cópia de segurança independente.
3. Feche o Safari e o app que contém a extensão.
4. Mova `/Applications/Gemini Voyager.app` para a Lixeira. Não clique no botão **Desinstalar** do Safari e não limpe os dados de extensões, os dados de sites nem os containers do Safari.
5. Copie `Voyager.app` para `/Applications`, abra-o uma vez e depois ative o Voyager no Safari, se for solicitado.
6. Verifique suas pastas, prompts, configurações e itens com estrela. Se algo estiver faltando, use **Mesclar** ou importe o JSON dos prompts.

O Voyager mantém os identificadores de bundle do app e da extensão existentes, então o macOS e o Safari continuam reconhecendo a mesma identidade do produto. As etapas de backup são uma precaução para instalações manuais antigas.
:::

1. Baixe a <SafariDownloadLink>versão mais recente do Safari (.dmg)</SafariDownloadLink>.
2. Clique duas vezes para abrir e siga as instruções para instalar.
3. Clique duas vezes para abrir o app.
4. Ative a extensão em **Ajustes do Safari > Extensões**.

> 💡 A versão para Safari agora é assinada diretamente para distribuição, sem necessidade de conversão pelo Xcode!
>
> ✅ **Suporte oficial ao Safari**: desde a v1.6.0, são suportados remoção de marca d'água, exportação de imagens, sincronização com Google Drive/iCloud, notificações de resposta e atualizações via Sparkle.

---

_Configuração de desenvolvimento? Se você é desenvolvedor e quer contribuir, confira nosso [Guia de Contribuição](https://github.com/voyager-crew/voyager/blob/main/.github/CONTRIBUTING.md)._
