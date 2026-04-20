# Les dossiers, comme ils devraient l'être

Pourquoi organiser les chats AI est-il si difficile ?
Nous avons réglé ça. Nous avons construit un système de fichiers pour vos pensées.

<div style="display: flex; gap: 20px; margin-top: 20px; flex-wrap: wrap; margin-bottom: 40px;">
  <div style="flex: 1; min-width: 300px; text-align: center;">
    <p><b>Gemini™</b></p>
    <img src="/assets/gemini-folders.png" alt="Dossiers Gemini" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);"/>
  </div>
  <div style="flex: 1; min-width: 300px; text-align: center;">
    <p><b>AI Studio</b></p>
    <img src="/assets/aistudio-folders.png" alt="Dossiers AI Studio" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);"/>
  </div>
</div>

## La physique de l'organisation

C'est tout simplement naturel.

- **Glisser-Déposer** : Prenez un chat. Déposez-le dans un dossier. C'est tactile.
- **Hiérarchie imbriquée** : Les projets ont des sous-projets. Créez des dossiers dans des dossiers. Structurez à _votre_ façon.
- **Espacement des dossiers** : Ajustez la densité de la barre latérale, de compact à spacieux.
  > _Note : Sur Mac Safari, les ajustements peuvent ne pas être en temps réel ; actualisez la page pour voir l'effet._
- **Synchronisation Instantanée** : Organisez sur votre bureau. Retrouvez-le sur votre ordinateur portable.

## Astuces de Pro

- **Multi-Sélection** : Appui long sur une conversation pour entrer en mode multi-sélection, puis sélectionnez plusieurs chats et déplacez-les tous en une fois.
- **Renommer** : Double-cliquez sur n'importe quel dossier pour le renommer.
- **Icônes** : Nous détectons automatiquement le type de Gem (Codage, Créatif, etc.) et attribuons la bonne icône. Vous n'avez rien à faire.

## Différences de fonctionnalités par plateforme

### Fonctionnalités communes

- **Gestion de base** : Glisser-déposer, renommer, multi-sélection.
- **Reconnaissance intelligente** : Détecte automatiquement les types de chat et assigne des icônes.
- **Hiérarchie imbriquée** : Support pour l'imbrication des dossiers.
- **Adaptation AI Studio** : Les fonctionnalités avancées seront bientôt disponibles sur AI Studio.
- **Sync Google Drive** : Synchronise la structure des dossiers avec Google Drive.

### Exclusivité Gemini

#### Masquer les discussions archivées

Une fois une discussion classée dans un dossier, c'est "fait" — mais elle continue par défaut à occuper de la place dans la liste principale de la barre latérale. Activez **Masquer les discussions archivées** dans la popup de l'extension → **Options de dossiers**, et la liste principale n'affiche plus que les conversations en cours. Un vrai inbox zero pour vos chats IA.

- La première fois que vous classez une discussion dans un dossier, Voyager affiche une petite carte dans la zone des dossiers permettant d'activer l'option en un clic. Si vous ne le souhaitez pas, cliquez sur « Plus tard » et nous ne vous dérangerons plus.
- Les discussions archivées **ne sont jamais supprimées** — elles restent accessibles dans leurs dossiers.
- Modifiable à tout moment depuis la popup.

#### Couleurs personnalisées

Cliquez sur l'icône du dossier pour personnaliser sa couleur. Choisissez parmi 7 couleurs par défaut ou utilisez le sélecteur de couleurs pour choisir n'importe quelle couleur.

<img src="/assets/folder-color.png" alt="Couleurs des dossiers" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); margin-top: 10px; max-width: 600px;"/>

#### Isolation de compte

Cliquez sur l'icône « personne » dans l'en-tête pour filtrer instantanément les chats des autres comptes Google. Gardez votre espace de travail propre lorsque vous utilisez plusieurs comptes.

<img src="/assets/current-user-only.png" alt="Isolation de compte" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); margin-top: 10px; max-width: 600px;"/>

#### Organisation automatique par IA

Trop de chats, la flemme de trier ? Laissez Gemini réfléchir à votre place.

Un clic copie votre structure de conversations actuelle, collez-la dans Gemini, et il génère un plan de dossiers prêt à importer — organisation instantanée.

**Étape 1 : Copiez votre structure de conversations**

En bas de la section dossiers dans le popup de l'extension, cliquez sur le bouton **AI Organize**. Il collecte automatiquement toutes vos conversations non classées et la structure de dossiers existante, génère un prompt et le copie dans votre presse-papiers.

<img src="/assets/ai-auto-folder.png" alt="AI Organize Button" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-width: 400px;"/>

**Étape 2 : Laissez Gemini trier**

Collez le contenu du presse-papiers dans une conversation Gemini. Il analysera vos titres de chat et produira un plan de dossiers en JSON.

**Étape 3 : Importez les résultats**

Cliquez sur **Importer des dossiers** depuis le menu du panneau de dossiers, sélectionnez **Ou collez du JSON directement**, collez le JSON renvoyé par Gemini, puis cliquez sur **Importer**.

<div style="display: flex; gap: 16px; margin-top: 12px; flex-wrap: wrap; margin-bottom: 24px;">
  <div style="text-align: center;">
    <img src="/assets/ai-auto-folder-2.png" alt="Import Menu" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-width: 240px;"/>
  </div>
  <div style="text-align: center;">
    <img src="/assets/ai-auto-folder-3.png" alt="Paste JSON Import" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-width: 400px;"/>
  </div>
</div>

- **Fusion incrémentale** : Utilise la stratégie « Fusionner » par défaut — ajoute uniquement les nouveaux dossiers et assignations, sans jamais détruire votre organisation existante.
- **Multilingue** : Le prompt utilise automatiquement votre langue configurée, et les noms de dossiers sont générés dans cette langue également.

#### Dossier comme projet

Vous voulez donner aux nouveaux chats un léger preset de projet ? Transformez n'importe quel dossier en projet.
L'idée s'inspire de Claude Projects, mais Voyager l'implémente sous une forme plus légère : des instructions pour le premier message basées sur le dossier et un classement automatique, pas un espace de travail à contexte partagé.

1. Activez `Activer Dossier comme Projet` dans la fenêtre de l'extension.
2. Faites un clic droit sur un dossier puis choisissez `Définir les instructions` ou `Modifier les instructions`.
3. Ouvrez un nouveau chat Gemini, utilisez le sélecteur de dossiers à côté de la zone de saisie et choisissez ce dossier.
4. Envoyez votre premier message.

Ce qui se passe ensuite :

- La conversation est automatiquement rangée dans ce dossier après le premier envoi.
- Si le dossier contient des instructions, Voyager les préfixe uniquement pour ce premier envoi.
- Si le dossier n'a pas d'instructions, il reste utile comme raccourci de classement rapide.
- Les chats d'un même dossier **ne** partagent **pas** automatiquement leur mémoire et ne lisent pas le contenu des autres.
- L'auto-enregistrement des brouillons conserve uniquement votre texte ; les instructions cachées ne reviennent pas dans le champ de saisie.

### Exclusivité AI Studio

- **Ajustement de la barre latérale** : Faites glisser pour redimensionner la largeur de la barre latérale.
- **Intégration Library** : Glissez directement depuis votre Library vers les dossiers.
