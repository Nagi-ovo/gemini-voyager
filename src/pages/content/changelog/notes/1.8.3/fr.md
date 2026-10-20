> _« Tout le monde peut cuisiner. » (Gusteau, 《Ratatouille》)_

### Nouveautés

- **Modèles de prompt** : écrivez `{{nom}}` dans un prompt enregistré et Voyager demande ces valeurs avant l’envoi. Les champs se placent dans la phrase à laquelle ils appartiennent, et le menu slash utilise le même analyseur.
- **Prompts envoyés** : un prompt envoyé ne remplit plus le tour de texte de gabarit. Il se réduit à une pastille portant son nom — ouvrez-la pour lire ce qui a réellement été envoyé, les valeurs que vous avez saisies y sont mises en évidence, et ce que vous avez écrit vous-même reste visible dans les deux états.
- **Complétion pendant la saisie** : après `/`, la fin du nom du prompt sélectionné s'affiche au-delà du curseur. Tab l'accepte, Entrée insère le prompt.
- **Modifier une valeur avant l'envoi** : survolez un prompt déjà inséré et modifiez ce que vous aviez saisi, directement dans l'aperçu.

### Corrections

- **Entrées de dossier orphelines** : supprimer une conversation dans Gemini retire désormais l’entrée correspondante du dossier, sans laisser de liens morts.
- **Position de lecture** _(désactivé par défaut)_ : avec « Empêcher le défilement auto » activé, une réponse terminée ne vous ramène plus en bas pendant que vous relisez plus haut.
- **Largeur du chat** : dans la nouvelle mise en page de Gemini, la largeur du chat et celle de la zone d’édition se règlent séparément. La zone de saisie n’est plus verrouillée sur la largeur du chat.
- **Bouton d’export ChatGPT** _(désactivé par défaut)_ : le bouton d’export ne recouvre plus Partager ni le menu Autres en haut de ChatGPT.
- **Zone d’édition de Gemini** : sur Safari et Firefox, les boutons Annuler et Mettre à jour reviennent sous la zone d’édition au lieu de filer tout à gauche. Avec le curseur de largeur d’édition activé, la zone ne déborde plus de cette rangée.
- **Aperçu des prompts** : l’aperçu au survol rend le Markdown au lieu d’afficher `#` et `-` bruts, et adopte le style du panneau.
- **Couleur d’accent des prompts** : une couleur personnalisée garde sa saturation et ne revient plus au vert par défaut au survol.
- **Boîtes de dialogue des dossiers** : modifier les instructions d’un dossier ou choisir une destination survit à la reconstruction de la barre latérale de Gemini ; le texte saisi n’est plus perdu.
- **Dossiers sur Firefox** : une résolution de compte échouée est réessayée, donc le panneau ne s’affiche plus vide et n’abandonne plus en silence les dossiers que vous ajoutez.
- **Position de l'aperçu** : l'aperçu au survol du panneau se place à côté de celui-ci au lieu de s'étaler sur la liste, et l'aperçu d'un prompt du champ de saisie est centré juste au-dessus de lui.
- **Valeurs longues** : une valeur longue passe à la ligne avec la phrase qui l'entoure, au lieu de forcer sa carte à défiler horizontalement.
- **Surfaces de la timeline** : l'aperçu au survol et le menu contextuel de la timeline reprennent la palette et la typographie du panneau de prompts, au lieu de leur propre bleu sombre.
