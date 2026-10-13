# Bifurcation de conversation (expérimental)

La réflexion ne devrait pas être à sens unique. Dans les explorations complexes, il faut souvent revenir à un point crucial et tester d'autres possibilités.

Avec la fonctionnalité **Bifurcation de conversation**, Voyager vous permet de faire diverger vos idées et d'explorer des univers parallèles de votre discussion.

## Comment ça marche

> **⚠️ Remarque** : il s'agit d'une fonctionnalité expérimentale. Vous devez d'abord l'activer : cliquez sur l'icône de l'extension dans la barre d'outils pour ouvrir la fenêtre des paramètres, puis activez l'interrupteur **Activer le fork de conversation**.

Chaque fois que vous voulez emprunter un autre chemin, survolez votre prompt et cliquez sur le bouton **Fork** :

![Bifurcation de conversation](/assets/branching.png)

Voyager capture tout le contexte, depuis le début jusqu'à ce point, puis affiche une boîte de confirmation. Choisissez selon la longueur du contexte :

- **Download MD** (recommandé pour la plupart des conversations) : le champ de saisie de Gemini a une limite de longueur, donc un long contexte peut ne pas tenir s'il est collé directement. Voyager télécharge un fichier Markdown contenant le contexte et ouvre une nouvelle conversation ; faites glisser le fichier `.md` dans Gemini avant la fin du compte à rebours de 2 minutes, en bas à droite. Le champ de saisie est pré-rempli d'une courte note indiquant que la pièce jointe est le contexte de la conversation précédente, avec **New request:** pour votre prochain message.
- **Fork** (idéal pour les conversations courtes) : si le contexte est court, Voyager ouvre une nouvelle conversation et remplit directement le champ de saisie ; envoyez-le pour créer la branche.

Après l'envoi, Voyager enregistre seulement la relation de branche. Il ne supprime ni ne réécrit votre conversation d'origine.

Dans cette nouvelle branche, vous pouvez modifier librement votre question et explorer d'autres directions, sans risquer de détruire l'historique de votre conversation d'origine. Laissez libre cours à votre créativité et à votre curiosité !
