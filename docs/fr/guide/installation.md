# Installation

Choisissez votre voie.

> ⚠️ Note : Le Gestionnaire de Prompts est la seule fonctionnalité compatible avec Gemini pour Entreprise.

## 1. Stores d'Extensions (Recommandé)

La façon la plus simple de commencer. Les mises à jour sont automatiques.

**Chrome / Brave / Opera / Vivaldi :**

[<img src="https://img.shields.io/badge/Chrome_Web_Store-Télécharger-4285F4?style=for-the-badge&logo=google-chrome&logoColor=white" alt="Installer depuis le Chrome Web Store" height="40"/>](https://chromewebstore.google.com/detail/kjdpnimcnfinmilocccippmododhceol)

**Microsoft Edge :**

[<img src="https://img.shields.io/badge/Microsoft_Edge-Télécharger-0078D7?style=for-the-badge&logo=microsoft-edge&logoColor=white" alt="Installer depuis les modules complémentaires Microsoft Edge" height="40"/>](https://microsoftedge.microsoft.com/addons/detail/gemini-voyager/gibmkggjijalcjinbdhcpklodjkhhlne)

**Firefox :**

[<img src="https://img.shields.io/badge/Firefox_Add--ons-Télécharger-FF7139?style=for-the-badge&logo=firefox&logoColor=white" alt="Installer depuis Firefox Add-ons" height="40"/>](https://addons.mozilla.org/firefox/addon/gemini-voyager/)

## 2. La Méthode Manuelle (Dernières Fonctionnalités)

Le processus de validation des stores peut être lent. Si vous voulez la version à la pointe de la technologie immédiatement, installez-la manuellement.

**Pour Chrome / Edge / Brave / Opera :**

1. Téléchargez la dernière version de `gemini-voyager-chrome-vX.Y.Z.zip` depuis les [Releases GitHub](https://github.com/Nagi-ovo/gemini-voyager/releases).
2. Décompressez le fichier.
3. Ouvrez la page des Extensions de votre navigateur (`chrome://extensions`).
4. Activez le **Mode développeur** (en haut à droite).
5. Cliquez sur **Charger l'extension non empaquetée** et sélectionnez le dossier que vous venez de décompresser.

**Pour Firefox :**

1. Téléchargez la dernière version de `gemini-voyager-firefox-vX.Y.Z.xpi` depuis les [Releases](https://github.com/Nagi-ovo/gemini-voyager/releases).
2. Ouvrez le Gestionnaire de modules complémentaires (`about:addons`).
3. Glissez-déposez le fichier `.xpi` pour l'installer (ou cliquez sur l'icône d'engrenage ⚙️ -> **Installer un module depuis un fichier**).

> 💡 Le fichier XPI est officiellement signé par Mozilla et peut être installé de manière permanente sur toutes les versions de Firefox.

## 3. Safari (macOS)

1. Téléchargez `gemini-voyager-safari-vX.Y.Z.zip` depuis les [Releases](https://github.com/Nagi-ovo/gemini-voyager/releases).
2. Décompressez le fichier.
3. Exécutez la commande suivante dans le Terminal pour la convertir (nécessite Xcode) :
   ```bash
   xcrun safari-web-extension-converter dist_safari --macos-only --app-name "Gemini Voyager"
   ```
4. Lancez l'application dans Xcode pour l'installer.
5. Activez-la dans Réglages Safari > Extensions.

---

_Configuration de développement ? Si vous êtes un développeur souhaitant contribuer, consultez notre [Guide de Contribution](https://github.com/Nagi-ovo/gemini-voyager/blob/main/.github/CONTRIBUTING.md)._
