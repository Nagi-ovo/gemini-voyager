# Des dossiers, comme ils devraient l'être

Pourquoi est-il si difficile d'organiser ses conversations IA ?
Nous avons réglé le problème. Nous avons construit un système de fichiers pour vos idées.

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

- **Glisser-déposer** : prenez une conversation, déposez-la dans un dossier. C'est tactile.
- **Hiérarchie imbriquée** : les projets ont des sous-projets. Créez des dossiers dans des dossiers. Structurez-les à _votre_ façon.
- **Espacement des dossiers** : ajustez la densité verticale, de compact à aéré.
  > _Remarque : sur Safari pour Mac, les ajustements peuvent ne pas être instantanés ; actualisez la page pour voir l'effet._
- **Synchronisation entre appareils** : organisez sur votre ordinateur de bureau, puis utilisez la [Synchro Cloud](/fr/guide/cloud-sync) pour retrouver les mêmes dossiers sur votre ordinateur portable.

## Astuces de pro

- **Multi-sélection** : appuyez longuement sur une conversation pour passer en mode multi-sélection, puis sélectionnez plusieurs discussions et déplacez-les toutes d'un coup.
- **Renommer** : double-cliquez sur un dossier pour le renommer.
- **Icônes** : nous détectons automatiquement le type de Gem (code, création, etc.) et attribuons la bonne icône. Vous n'avez rien à faire.

## Différences de fonctionnalités selon la plateforme

### Fonctionnalités communes

- **Gestion de base** : glisser-déposer, renommer, multi-sélection.
- **Reconnaissance intelligente** : détection automatique du type de discussion et attribution d'icônes.
- **Hiérarchie imbriquée** : prise en charge de l'imbrication des dossiers.
- **Synchro Cloud** : sauvegardez et synchronisez la structure de vos dossiers avec la [Synchro Cloud](/fr/guide/cloud-sync).

#### Masquer les discussions archivées

Une fois une discussion classée dans un dossier, elle est « réglée » ; mais par défaut elle occupe toujours de la place dans la liste principale. Activez **Masquer les discussions archivées** dans la fenêtre de l'extension → **Options des dossiers**, et la liste principale n'affiche plus que ce qui est encore actif. Une vraie boîte de réception à zéro pour vos discussions IA.

- La première fois que vous classez une discussion dans un dossier, Voyager affiche une petite carte directement dans la zone des dossiers, avec une option pour l'activer en un clic. Si vous la fermez, nous ne reviendrons pas à la charge.
- Les discussions archivées ne sont **jamais supprimées** : elles restent entièrement accessibles dans leurs dossiers.
- Sur AI Studio, les discussions classées sont masquées dans le tableau de la Library à la place. Gemini et AI Studio conservent chacun leur propre réglage.
- Modifiable à tout moment depuis la fenêtre de l'extension.

### Exclusivités Gemini

#### Couleurs personnalisées

Cliquez sur l'icône du dossier pour personnaliser sa couleur. Choisissez parmi 7 couleurs par défaut, ou utilisez le sélecteur de couleurs pour n'importe quelle teinte.

<img src="/assets/folder-color.png" alt="Couleurs des dossiers" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); margin-top: 10px; max-width: 600px;"/>

#### Isolation des comptes

L'icône « personne » n'affiche temporairement que les discussions du compte Google actuel ; elle est désactivée par défaut. **Enable Hard Isolation** dans les options des dossiers va plus loin en séparant les données des dossiers et de la synchronisation cloud par compte. Lorsque l'isolation renforcée est active, le filtre par personne fait double emploi et est masqué automatiquement.

<img src="/assets/current-user-only.png" alt="Isolation des comptes" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); margin-top: 10px; max-width: 600px;"/>

#### Organisation automatique par IA

Trop de discussions, et pas le courage de trier ? Laissez Gemini réfléchir à votre place.

Un clic copie la structure de vos conversations actuelles ; collez-la dans Gemini, qui génère un plan de dossiers prêt à être importé. Organisation instantanée.

**Étape 1 : copiez la structure de vos conversations**

En bas de la section des dossiers dans la fenêtre de l'extension, cliquez sur le bouton **Organiser par IA**. Il rassemble automatiquement toutes vos discussions non classées et la structure de dossiers existante, génère un prompt et le copie dans votre presse-papiers.

<img src="/assets/ai-auto-folder.png" alt="Bouton Organiser par IA" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-width: 400px;"/>

**Étape 2 : laissez Gemini trier**

Collez le contenu du presse-papiers dans une conversation Gemini. Il analysera vos titres de discussions et produira un plan de dossiers au format JSON.

**Étape 3 : importez les résultats**

Cliquez sur **Importer dossiers** dans le menu du panneau des dossiers, sélectionnez **Ou coller le JSON directement**, collez le JSON renvoyé par Gemini, puis cliquez sur **Importer**.

<div style="display: flex; gap: 16px; margin-top: 12px; flex-wrap: wrap; margin-bottom: 24px;">
  <div style="text-align: center;">
    <img src="/assets/ai-auto-folder-2.png" alt="Menu d'importation" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-width: 240px;"/>
  </div>
  <div style="text-align: center;">
    <img src="/assets/ai-auto-folder-3.png" alt="Importation du JSON collé" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-width: 400px;"/>
  </div>
</div>

- **Fusion incrémentale** : la stratégie **Fusionner avec les dossiers existants** est utilisée par défaut. Elle n'ajoute que les nouveaux dossiers et affectations, sans jamais détruire votre organisation existante.
- **Multilingue** : le prompt utilise automatiquement la langue que vous avez configurée, et les noms de dossiers sont générés dans cette langue.

#### Dossier comme projet

Vous voulez que vos nouvelles discussions démarrent avec un préréglage de projet léger ? Transformez n'importe quel dossier en projet.
Cette idée s'inspire de Claude Projects, mais Voyager l'implémente sous une forme plus légère : des instructions pour le premier message, liées au dossier, et un classement automatique, et non un espace de travail à contexte partagé.

1. Activez **Activer Dossier comme Projet** dans la fenêtre de l'extension.
2. Faites un clic droit sur un dossier, puis choisissez **Définir les instructions** ou **Modifier les instructions**.
3. Ouvrez une nouvelle discussion Gemini, utilisez le sélecteur de dossier à côté de la zone de saisie et choisissez ce dossier.
4. Envoyez votre premier message.

Ce qui se passe ensuite :

- La discussion est automatiquement rangée dans ce dossier après le premier envoi.
- Si le dossier contient des instructions, Voyager les ajoute en tête uniquement pour ce premier envoi.
- Si le dossier n'a pas d'instructions, il reste un raccourci pratique pour classer rapidement.
- Les discussions d'un même dossier ne partagent **pas** de mémoire et ne se lisent pas automatiquement entre elles.
- L'enregistrement automatique des brouillons ne conserve que le texte que vous avez tapé ; les instructions cachées ne reviennent pas dans la zone de saisie.

### Exclusivités AI Studio

- **Ajustement de la barre latérale** : faites glisser pour redimensionner la largeur de la barre latérale.
- **Intégration à la Library** : faites glisser directement depuis votre Library vers les dossiers.

### ChatGPT

Les dossiers arrivent aussi sur ChatGPT, sous forme d'extension intégrée. Vous obtenez une section de dossiers dans la barre latérale de ChatGPT, ainsi que le même panneau flottant. Classez une discussion avec **Déplacer vers un dossier** dans son menu, ou faites glisser sa ligne sur un dossier. L'import, l'export et la vue Activité y fonctionnent aussi. Activez ou désactivez-la depuis la section **Extensions** de la fenêtre de l'extension.
