# Bifurcation de Conversation (Expérimental)

La pensée ne devrait pas être à sens unique. Dans les explorations complexes, nous avons souvent besoin de revenir à un nœud crucial et d'essayer d'autres possibilités.

Avec la fonctionnalité de **Bifurcation**, Voyager vous permet de développer vos idées et d'explorer des univers parallèles de votre discussion.

## Comment ça marche

> **⚠️ Remarque** : Il s'agit d'une fonctionnalité expérimentale. Vous devez d'abord l'activer en cliquant sur l'icône de l'extension dans votre barre d'outils pour ouvrir la fenêtre contextuelle des paramètres, et en activant le commutateur **"Activer la bifurcation de conversation"**.

Chaque fois que vous souhaitez emprunter un chemin différent, survolez simplement votre question et cliquez sur le bouton **Bifurquer** :

![Bifurcation](/assets/branching.png)

Voyager capture tout le contexte depuis le début jusqu'à ce point, puis affiche une boîte de confirmation. Choisissez selon la longueur du contexte :

- **Télécharger le MD** (recommandé pour la plupart des conversations) : le champ de saisie de Gemini a une limite de longueur, donc un long contexte peut ne pas tenir s'il est inséré directement. Voyager télécharge un fichier Markdown contenant le contexte et ouvre une nouvelle conversation ; faites glisser le fichier `.md` dans Gemini avant la fin du compte à rebours de 2 minutes en bas à droite. Le champ de saisie est prérempli avec une courte note indiquant que la pièce jointe est le contexte de la conversation précédente, avec un espace pour votre nouvelle demande.
- **Fork** (idéal pour les conversations courtes) : si le contexte est court, Voyager ouvre une nouvelle conversation et remplit directement le champ de saisie ; envoyez-le pour créer la branche.

Après l'envoi, Voyager enregistre uniquement la relation de branche. Il ne supprime ni ne réécrit la conversation d'origine.

Dans cette nouvelle branche, vous pouvez modifier librement votre question et explorer différentes directions sans craindre de détruire votre historique de conversation d'origine. Libérez votre créativité et votre curiosité !
