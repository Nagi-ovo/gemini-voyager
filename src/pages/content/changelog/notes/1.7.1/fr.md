> _« Attention is all you need. » — Vaswani et al., 《Attention Is All You Need》(2017)_

### Nouveautés

- **Chronologie règle** _(désactivé par défaut)_ : un troisième style de chronologie dont les graduations s'élargissent autour de votre position de lecture, avec un aperçu de la question et de la réponse au survol. Activez-le dans « Style de chronologie » depuis la fenêtre de l'extension.
- **Vue Activité** _(désactivé par défaut)_ : cliquez sur la cloche à côté de Dossiers dans la barre latérale de Gemini pour remplacer l'arborescence par une liste chronologique — Prioritaire (nouvelle réponse dans les 3 dernières heures), Aujourd'hui, Hier — et voir d'un coup d'œil quelle conversation reprendre. [→ Docs](/guide/activity-view) ![Vue Activité](https://github.com/voyager-crew/voyager/raw/main/docs/public/assets/promotion/Activity-View.png)
- **Gestionnaire de prompts sur les sites avec port** : ajoutez des sites de discussion auto-hébergés comme `localhost:3000` en tant que sites personnalisés.
- **Largeur de la barre latérale depuis le menu Dossiers** _(désactivé par défaut)_ : ajustez la largeur sur place, sans ouvrir la fenêtre de l'extension.
- **La recherche de réglages retient votre dernière saisie** : en rouvrant la fenêtre, le champ de recherche retrouve ce que vous aviez tapé.

### Corrections

- **La navigation dans la chronologie ne se bloque plus** : après que Gemini reconstruit sa zone de défilement, les points de la chronologie, la liste d'aperçu et les raccourcis `j`/`k` continuent d'atteindre le bon message.
- **L'aperçu compact survit à l'espace vide** : déplacer le pointeur du rail vers le panneau d'aperçu ne le referme plus, et ses éléments redeviennent cliquables.
- **Les boutons de l'en-tête sont de nouveau cliquables** : avec la largeur de discussion activée, une zone cliquable invisible autour du logo Gemini ne bloque plus les boutons fermer la barre latérale, discussion temporaire et les autres.
- **La zone de dépôt de fichiers suit la largeur de votre champ de saisie** : le voile bleu couvre désormais le champ élargi au lieu de s'arrêter à la largeur par défaut de Gemini.
- **La copie de formules refonctionne sur ChatGPT** : ChatGPT a changé sa façon d'afficher les formules, ce qui rendait la copie inopérante ; les formules en bloc reçoivent aussi les bons délimiteurs. Les extensions qui restaient inactives dans Edge après l'octroi de l'accès au site s'activent maintenant immédiatement.
- **Davantage de filigranes supprimés** : plus d'images Gemini en pleine taille ressortent propres, et le badge 🍌 apparaît dès qu'un bouton de téléchargement est présent, sans attendre le chargement du moteur.
- **Un avertissement quand Google renvoie une image abîmée** : si l'original téléchargé ne correspond pas à l'aperçu affiché — flou ou tronqué — Voyager vous prévient et précise qu'il n'en est pas la cause.
- **Et aussi** : le champ de recherche des réglages n'affiche plus deux boutons d'effacement, la préférence de badge de mise à jour a rejoint les Options générales où la recherche la trouve, le guide Claude ne recouvre plus un artefact ouvert, et l'interrupteur pour masquer Dossiers a disparu — ce que vous aviez masqué revient replié.
