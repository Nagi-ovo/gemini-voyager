# Dossiers

Rangez vos conversations dans des dossiers de la barre latérale : glissez-en une dans un dossier et elle est classée, imbriquez les dossiers sur trois niveaux et retrouvez les mêmes sur un autre ordinateur.

<SiteSupport feature="folders" :labels="{ folders: 'Dossiers dans la barre latérale', 'hide-filed': 'Masquer les conversations classées', activity: 'Vue Activity', 'account-isolation': 'Isolation des comptes', projects: 'Dossiers comme projets', 'ai-organize': 'Organiser par IA' }" />

Seulement sur certains sites :

- **Déplacer vers un dossier** dans le menu de conversation du site : Gemini, ChatGPT, Claude
- Glisser depuis le tableau Library vers un dossier : AI Studio
- Icônes de conversation selon le type de Gem : Gemini

Un ✓ entouré fonctionne dès l’installation. Sur les autres sites, ouvrez la fenêtre de Voyager sur le site et activez les dossiers dans la zone **Extensions** ; la première fois, l’accès au site vous est demandé.

## Où les trouver

La section des dossiers se trouve au-dessus de la liste des conversations, dans la barre latérale. Quand la barre latérale est fermée, les mêmes dossiers restent disponibles dans un panneau flottant.

<img src="/assets/gemini-folders.png" alt="La section des dossiers dans la barre latérale" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-width: 320px;"/>

## Classer une conversation

- **Glisser** : faites glisser une conversation de la barre latérale sur un dossier.
- **Menu de la conversation** : sur les sites qui le permettent, ouvrez le menu de la conversation et choisissez **Déplacer vers un dossier**.
- **Sélection multiple** : appuyez longuement sur une conversation d’un dossier pour en sélectionner plusieurs, puis déplacez-les d’un coup. La barre latérale d’AI Studio ne gère pas encore la sélection multiple.

## Imbriquer, renommer et colorer

<img src="/assets/folders-nested-en.png" alt="Des dossiers imbriqués sur trois niveaux" width="240" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);"/>

- Les dossiers vont jusqu’à trois niveaux : un dossier de premier niveau peut contenir deux niveaux de sous-dossiers.
- Double-cliquez sur le nom d’un dossier pour le renommer.
- Un clic droit sur un dossier permet de l’épingler, de créer un sous-dossier, de le renommer, de le supprimer ou de choisir l’une des 7 couleurs.

<img src="/assets/folders-menu-en.png" alt="Le menu contextuel d’un dossier et ses couleurs" width="254" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);"/>

La roue dentée de l’en-tête des dossiers change l’ordre des conversations (ordre manuel ou ouvertes récemment) et règle la taille du texte, l’espacement des dossiers et le retrait des sous-dossiers ; le réglage **Espacement des dossiers** de la fenêtre le fait aussi. Sur Safari pour Mac, il faut parfois actualiser la page pour voir le changement.

## Masquer les conversations classées

Une fois une conversation dans un dossier, vous pouvez la retirer de la liste principale pour n’y garder que les conversations en cours.

- Sur Gemini et AI Studio, ouvrez la fenêtre → **Options des dossiers** → **Masquer les discussions archivées**. Chaque site garde son propre réglage ; sur AI Studio, ce sont les lignes du tableau Library qui sont masquées.
- Sur Gemini et AI Studio, la première fois que vous classez une conversation, une carte dans la section des dossiers propose de l’activer en un clic. Choisissez **Pas maintenant** et elle ne reviendra pas.
- Sur les autres sites, l’interrupteur se trouve dans les réglages du plugin des dossiers, zone **Extensions** de la fenêtre ; il est désactivé par défaut.
- Rien n’est supprimé : les conversations classées restent dans leurs dossiers, et vous pouvez désactiver l’option à tout moment.

## Importer et exporter

<img src="/assets/folders-transfer-en.png" alt="Importer et exporter des dossiers" width="190" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);"/>

L’icône de dossier de l’en-tête propose **Importer dossiers** et **Exporter dossiers**. L’export enregistre un fichier JSON ; l’import le fusionne avec vos dossiers existants, sans défaire ce que vous avez déjà classé.

## Synchronisation cloud

Chaque site qui a des dossiers peut utiliser la [synchronisation cloud](/fr/guide/cloud-sync) pour retrouver les mêmes dossiers sur un autre ordinateur. Les dossiers de chaque site sont enregistrés et synchronisés séparément.

## Vue Activity

La cloche de l’en-tête remplace l’arborescence par une vue Activity en lecture seule ; appuyez de nouveau pour revenir à l’arborescence. Elle ne déplace, ne copie et ne reclasse aucune conversation.

- **Priorité** : les conversations avec une vraie activité dans les 3 dernières heures. Ouvrir ou consulter une conversation ne compte pas.
- **Aujourd’hui, Hier et jours de la semaine** : classées par dernière activité réelle, en ne gardant qu’aujourd’hui et les quatre jours précédents.
- L’étoile est une marque manuelle à part et ne décide pas de ce qui entre dans Priorité.
- Les conversations plus anciennes, ou sans heure connue, n’apparaissent pas dans Activity et restent dans leurs dossiers.
- Chaque entrée indique son dossier ; une conversation présente dans plusieurs dossiers n’apparaît qu’une fois.

[Lire le guide complet de la vue Activity](/fr/guide/activity-view)

## Isolation des comptes

Le bouton en forme de personne dans la barre latérale de Gemini n’affiche temporairement que les conversations du compte Google actuel ; il est désactivé par défaut. **Enable Hard Isolation**, dans **Options des dossiers** de la fenêtre, sépare les dossiers et les données de synchronisation par compte ; une fois activé, les données sont déjà séparées et le bouton se masque.

<img src="/assets/current-user-only.png" alt="Le bouton en forme de personne" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-width: 200px;"/>

## Organiser par IA

Trop de conversations à trier à la main ? Laissez Gemini proposer un plan de dossiers.

1. Ouvrez la fenêtre sur Gemini et cliquez sur **Organiser par IA** en bas de **Options des dossiers**. Vos conversations non classées et la structure actuelle des dossiers sont copiées sous forme de prompt. Le prompt est dans votre langue, tout comme les noms de dossiers.
2. Collez le prompt dans Gemini. Il répond avec un plan de dossiers en JSON.
3. Cliquez sur **Importer dossiers** dans l’en-tête, choisissez **Ou coller le JSON directement**, collez, puis cliquez sur **Importer**. **Fusionner** est le choix par défaut : seuls les nouveaux dossiers et les nouveaux classements sont ajoutés, le reste ne bouge pas.

<img src="/assets/ai-auto-folder.png" alt="Le bouton Organiser par IA dans la fenêtre" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-width: 320px;"/>

## Dossiers comme projets

Donnez à un dossier des instructions de premier tour : une nouvelle conversation s’y range d’elle-même après son premier message. L’idée vient de Claude Projects, mais Voyager se limite aux instructions de premier tour et au classement automatique ; ce n’est pas un espace de travail au contexte partagé.

1. Activez **Activer Dossier comme Projet** dans la fenêtre.
2. Faites un clic droit sur un dossier et choisissez **Définir les instructions** ou **Modifier les instructions**.
3. Ouvrez une nouvelle conversation Gemini et choisissez le dossier dans le sélecteur à côté du champ de saisie.
4. Envoyez votre premier message.

Ensuite :

- Après le premier envoi, la conversation est classée dans ce dossier.
- Si le dossier a des instructions, Voyager ne les ajoute qu’à ce premier envoi. Sans instructions, le dossier sert de raccourci pour classer les nouvelles conversations.
- Les conversations d’un même dossier ne partagent **pas** de mémoire et ne lisent pas le contenu des autres.
- L’enregistrement automatique du brouillon ne garde que ce que vous avez tapé, jamais les instructions cachées.

Pour la largeur de la barre latérale, voir [Largeur de la barre latérale](/fr/guide/sidebar).
