# Bifurcation de Conversation (Expérimental)

La pensée ne devrait pas être à sens unique. Dans les explorations complexes, nous avons souvent besoin de revenir à un nœud crucial et d'essayer d'autres possibilités.

Avec la fonctionnalité de **Bifurcation**, Voyager vous permet de développer vos idées et d'explorer des univers parallèles de votre discussion.

## Comment ça marche

> **⚠️ Remarque** : Il s'agit d'une fonctionnalité expérimentale. Vous devez d'abord l'activer en cliquant sur l'icône de l'extension dans votre barre d'outils pour ouvrir la fenêtre contextuelle des paramètres, et en activant le commutateur **"Activer la bifurcation de conversation"**.

Chaque fois que vous souhaitez emprunter un chemin différent, survolez simplement votre question et cliquez sur le bouton **Bifurquer** :

![Bifurcation](/assets/branching.png)

Voyager capture tout le contexte depuis le début jusqu'à ce point, puis affiche une boîte de confirmation :

- Cliquez sur **Fork** : Voyager ouvre une nouvelle conversation et remplit automatiquement le champ de saisie avec le contexte capturé. Relisez-le, puis envoyez-le pour créer la branche.
- Cliquez sur **Télécharger le MD** : Voyager télécharge un fichier Markdown contenant le contexte et ouvre une nouvelle conversation. Avant la fin du compte à rebours en bas à droite (dans les 2 minutes), faites glisser le fichier `.md` dans la zone de saisie de Gemini. Le champ de saisie est prérempli avec un court modèle indiquant que la pièce jointe est le contexte de la conversation précédente, et laisse un espace pour votre nouvelle demande. Après l'envoi, la nouvelle conversation est enregistrée comme branche de ce point.

Comme le flux de pièces jointes de Gemini ne peut pas être automatisé de manière fiable par l'extension, le mode MD vous demande de faire glisser le fichier manuellement. Le compte à rebours indique le temps restant ; une fois expiré, le lien de bifurcation de cette tentative n'est plus créé.

Voyager enregistre uniquement la relation de branche. Il ne supprime ni ne réécrit la conversation d'origine.

Dans cette nouvelle branche, vous pouvez modifier librement votre question et explorer différentes directions sans craindre de détruire votre historique de conversation d'origine. Libérez votre créativité et votre curiosité !
