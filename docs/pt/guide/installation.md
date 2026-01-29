# Instalação

Escolha o seu caminho.

> ⚠️ Nota: O Gestor de Prompts é a única funcionalidade que suporta Gemini para Enterprise.

## 1. Lojas de Extensões (Recomendado)

A forma mais simples de começar. As atualizações são automáticas.

**Chrome / Brave / Opera / Vivaldi:**

[<img src="https://img.shields.io/badge/Chrome_Web_Store-Download-4285F4?style=for-the-badge&logo=google-chrome&logoColor=white" alt="Instalar da Chrome Web Store" height="40"/>](https://chromewebstore.google.com/detail/kjdpnimcnfinmilocccippmododhceol)

**Microsoft Edge:**

[<img src="https://img.shields.io/badge/Microsoft_Edge-Download-0078D7?style=for-the-badge&logo=microsoft-edge&logoColor=white" alt="Instalar do Microsoft Edge Add-ons" height="40"/>](https://microsoftedge.microsoft.com/addons/detail/gemini-voyager/gibmkggjijalcjinbdhcpklodjkhhlne)

**Firefox:**

[<img src="https://img.shields.io/badge/Firefox_Add--ons-Download-FF7139?style=for-the-badge&logo=firefox&logoColor=white" alt="Instalar do Firefox Add-ons" height="40"/>](https://addons.mozilla.org/firefox/addon/gemini-voyager/)

## 2. A Via Manual (Funcionalidades Mais Recentes)

O processo de revisão da Web Store pode ser lento. Se quiser a versão de ponta imediatamente, instale manualmente.

**Para Chrome / Edge / Brave / Opera:**

1. Descarregue o último `gemini-voyager-chrome-vX.Y.Z.zip` das [Releases do GitHub](https://github.com/Nagi-ovo/gemini-voyager/releases).
2. Descompacte o ficheiro.
3. Abra a página de Extensões do seu navegador (`chrome://extensions`).
4. Ative o **Modo de programador** (canto superior direito).
5. Clique em **Carregar expandida** e selecione a pasta que acabou de descompactar.

**Para Firefox:**

1. Descarregue o último `gemini-voyager-firefox-vX.Y.Z.xpi` das [Releases](https://github.com/Nagi-ovo/gemini-voyager/releases).
2. Abra o Gestor de Add-ons (`about:addons`).
3. Arraste e largue o ficheiro `.xpi` para instalar (ou clique no ícone de engrenagem ⚙️ -> **Instalar Add-on de Ficheiro**).

> 💡 O ficheiro XPI é oficialmente assinado pela Mozilla e pode ser instalado permanentemente em todas as versões do Firefox.

## 3. Safari (macOS)

1. Descarregue `gemini-voyager-safari-vX.Y.Z.zip` das [Releases](https://github.com/Nagi-ovo/gemini-voyager/releases).
2. Descompacte o ficheiro.
3. Execute o seguinte comando no Terminal para convertê-lo (requer Xcode):
   ```bash
   xcrun safari-web-extension-converter dist_safari --macos-only --app-name "Gemini Voyager"
   ```
4. Execute a app no Xcode para instalar.
5. Ative nas Definições do Safari > Extensões.

---

_Configuração de desenvolvimento? Se é um programador à procura de contribuir, consulte o nosso [Guia de Contribuição](https://github.com/Nagi-ovo/gemini-voyager/blob/main/.github/CONTRIBUTING.md)._
