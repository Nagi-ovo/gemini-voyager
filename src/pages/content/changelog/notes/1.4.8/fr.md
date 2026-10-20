### Nouveautés

- **Marketplace de plugins officielle & guide de contribution** : Voyager intègre désormais une marketplace de plugins. Tout le monde peut publier un plugin via le [guide de contribution](https://voyager.nagi.fun/guide/plugin-contribution) — commencez par un plugin déclaratif CSS + JSON, sans compiler l'extension. Découvrez-les sur la [Plugin Store](https://voyager.nagi.fun/plugins).
- **Plugin natif « Copier les formules »** *(désactivé par défaut, à activer au besoin)* : Un nouveau plugin officiel « Copier les formules » est inclus dans l'extension — mais il reste **désactivé** tant que vous ne l'activez pas, et il ne fait strictement rien dans cet état. Pour l'utiliser, ouvrez la section Plugins du popup et activez le toggle du site concerné (Claude ou ChatGPT). Le navigateur affichera alors une boîte de dialogue unique pour autoriser Voyager à accéder au site. Une fois accepté, cliquez sur une formule dans la page : elle est copiée en LaTeX Markdown. Aucune activation silencieuse, et la boîte d'autorisation est l'unique étape de « configuration ».
- **Métadonnées des plugins localisées** : Le nom et la description des plugins suivent la langue du popup ; les cartes de la marketplace sur le site le sont aussi.

### Corrections

- **Ancre du filigrane déplacée par Gemini** : L'outil de suppression du filigrane a été ré-adapté à la nouvelle position d'ancre de Gemini — le signalement de forte fréquence d'échec en 1.4.7 est résolu.
- **Démontage complet du filigrane** : `stopWatermarkRemover` libère désormais tous les observers, timers et listeners qu'il a créés, ce qui évite un état bloqué sur « traitement ».
- **Cible du toggle de la barre latérale** : La zone de clic élargie du toggle de la barre latérale réduite, rétablie après le retour en arrière de la version précédente.
- **Titres de glisser-déposer des dossiers** : Les titres pendant le drag correspondent désormais au style natif de Gemini, aussi bien dans AI Studio que dans l'historique au survol.
- **Sélecteur de dossier vers le haut** : Le sélecteur de projet de dossier s'ouvre désormais vers le haut lorsqu'il n'y a pas la place en dessous.
- **Libellé « Retirer du dossier »** : Le message de confirmation est plus clair — vous retirez la conversation du dossier, pas le dossier lui-même.
- **Activation des tooltips de la timeline** : Les tooltips attendent désormais un survol explicite au lieu de clignoter à chaque défilement.
- **Portée des permissions optionnelles Firefox** : Les utilisateurs de Firefox 116+ peuvent à nouveau accorder les permissions optionnelles (régression introduite par le correctif Fx<128).
- **Restauration des sauvegardes durables Safari** : La restauration écrit désormais dans le stockage durable, ce qui évite la perte des sauvegardes de dossiers dans la fenêtre ITP de 7 jours.
- **Langue du toast « Copier la formule »** : Le toast de succès suit la langue d'interface choisie, et non la locale du navigateur.
- **Accessibilité** : Les sliders, switches et notations ont désormais des aria-labels appropriés, et `eslint-plugin-jsx-a11y` est appliqué en CI.

### Performances

- **Chargement paresseux de KaTeX et JSZip** : KaTeX et JSZIP ne sont plus inclus dans le bundle du content-script — ils ne se chargent qu'à la première utilisation (prévisualisation maths, export image).
- **Chargement différé de marked + KaTeX dans l'aperçu des prompts** : L'aperçu markdown ne parse plus les formules à l'ouverture du popup.
- **Initialisation du filigrane en différé** : L'initialisation de l'observer du filigrane est cédée à `requestIdleCallback`, pour un premier rendu plus fluide.
- **Isolation de compte : pas de réécriture à vide** : Les réécritures de profile-map sans changement sont désormais ignorées.
