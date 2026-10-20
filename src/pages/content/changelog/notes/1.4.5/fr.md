**Mise à jour importante — prenez une minute pour la parcourir.** L'interface web de Gemini vient de recevoir une refonte majeure, et cette version reconstruit toute l'extension pour la nouvelle disposition (barre latérale, sélecteur de modèle, panneau de dossiers, entrée Gems) afin que votre configuration existante continue de fonctionner. Les correctifs ci-dessous répondent à des rapports réels reçus ces dernières 24 heures — si quelque chose reste cassé, un suivi rapide est à prévoir.

### Nouveautés

- **Liste des Gems récents dans la barre latérale** : L'entrée Gems native s'étend en une liste de vos gems récents accessible en un clic.
- **Verrouillage du niveau de réflexion** : Le réglage de modèle par défaut mémorise et réapplique aussi votre niveau de réflexion préféré (Standard / Étendu).
- **Bouton de masquage du halo de saisie** *(désactivé par défaut)* : Masque le halo bleu en dégradé radial derrière le champ de saisie de Gemini.
- **Fork via téléversement Markdown** : Démarrez un nouveau fork en téléversant un fichier markdown — son contenu est pré-rempli comme contexte dans la nouvelle invite.
- **Réglages dans la barre d'outils du dossier** : Les réglages du panneau de dossier flottant passent dans sa barre d'outils, avec un menu de synchronisation cloud et un repli automatique en mode flottant.
- **Contrôles de masquage Notebooks / Recents** : Les boutons d'angle pour masquer Notebooks et Recents sont de retour, avec un nouveau bouton d'échange d'angle pour choisir la section au-dessus de laquelle le panneau de dossier s'ancre.

### Corrections

- **Sélecteur de modèle Gemini 2026** : Le verrouillage du modèle par défaut reconnaît la nouvelle superposition de sélection, le menu ne clignote plus en ouverture/fermeture.
- **Masquage automatique de la barre latérale sur Gemini 2026** : Le masquage automatique trouve désormais le nouveau bouton de réduction.
- **Placement du panneau de dossier** : Le panneau de dossier reste au-dessus de Recents même après les re-rendus de Gemini.
- **Débordement en barre latérale réduite** : Notre liste de gems et notre interface de dossiers ne dépassent plus du rail réduit.
- **Raccourcis clavier vs IME** : Les raccourcis ne se déclenchent plus pendant la saisie IME ni dans les champs éditables.
- **Sécurité d'écrasement de synchronisation cloud** : L'écrasement cloud est bloqué tant qu'aucune sauvegarde locale des dossiers n'existe.
- **Pré-remplissage du fork par téléversement Markdown** : Le téléversement d'un fichier markdown dans le flux de fork pré-remplit correctement l'invite contextuelle.
