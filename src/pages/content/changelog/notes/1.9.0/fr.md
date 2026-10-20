> _« Vers l'inconnu » — DeepSeek_

### Points forts

- 🐳 **Prise en charge de DeepSeek** : cinq plugins officiels — une chronologie avec messages favoris et recherche, la copie de formules, une largeur de lecture réglable, l'édition Vim dans le champ de saisie, et du code qui garde ses propres lignes.

### Nouveautés

- **Réordonner les prompts enregistrés** : faites glisser par la poignée en fin de ligne, ou utilisez ↑/↓. L'ordre reste juste même quand une recherche masque une partie de la liste.
- **Épingler des prompts** : l'étoile en fin de ligne garde vos favoris au-dessus des autres.
- **Les nouveaux plugins apparaissent tout seuls** : un nouveau plugin ou un correctif n'attend plus une publication de l'extension.

### Corrections

- **Variables de modèle dans n'importe quelle écriture** : `{{主题}}`, `{{테마}}` et `{{тема}}` n'étaient pas reconnus comme modèles — le formulaire ne s'ouvrait pas et le texte brut partait au modèle. Huit des dix langues étaient touchées ; les dix fonctionnent.
- **Copier et Insérer d'un modèle** : changer la préférence dans la popup pendant qu'un formulaire est ouvert ne change plus ce que fait son bouton.
- **Ordre de la chronologie** : remonter dans une longue conversation :claude: Claude ne relègue plus les premiers tours, et les repères compacts ne s'agglutinent plus en code-barres.
- **:chatgpt: Export ChatGPT** : un tour vide ne fait plus échouer tout l'export.
- **Sélection multiple dans les dossiers** : la confirmation, le compteur et le bouton de sortie ne sont plus en anglais codé en dur.
- **:gemini: Largeur de conversation Gemini** : le curseur n'élargissait que vos messages, les réponses restaient figées. Réponses, blocs de code et barre d'actions suivent maintenant.
- **Sauts de la chronologie** : un saut à travers une longue conversation glisse au lieu de se téléporter. Il reste instantané avec les animations réduites.
- **Repères favoris** : changer de conversation n'affiche plus les repères de la précédente.
- **Modèle par défaut** : :gemini: Gemini écrit « Flash » sur le bouton et « 3.8 Flash » dans le sélecteur, il fallait donc ouvrir le sélecteur à chaque nouvelle discussion. Plus maintenant — et un renommage est suivi.
- **Firefox** : certains styles échouaient en silence sur les anciennes versions ; ils se dégradent correctement.
