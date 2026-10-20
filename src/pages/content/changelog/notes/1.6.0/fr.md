> *« Tous ceux qui errent ne sont pas perdus. » — J. R. R. Tolkien, La Communauté de l'Anneau*

### Nouveautés

- **Safari gagne des fonctions macOS natives — et l'app devient Voyager**: la version Safari en téléchargement direct relie désormais sa WebExtension à la synchronisation native Google Drive et iCloud, ainsi qu'aux notifications macOS de fin de réponse qui ouvrent la bonne conversation. Après cette migration unique, les prochaines mises à jour arriveront via Sparkle. L'export d'images et la suppression de filigrane fonctionnent à nouveau, et les sauvegardes iCloud peuvent être supprimées depuis le popup sans toucher aux données locales. L'app hôte a été renommée de « Gemini Voyager » en « Voyager ». ⚠️ **Si vous mettez à jour, suivez une fois le guide de migration avant la mise à jour pour ne pas vous retrouver avec deux apps installées.**
- **Le mode de saisie Vim arrive sur Claude et ChatGPT**: la zone de message prend maintenant en charge l'édition clavier façon Vim au-delà de Gemini.
- **Blocs de code longs repliables**: les blocs de code trop longs peuvent être repliés d'un bouton pour ne plus envahir l'écran pendant le défilement.
- **Recherche par dossier uniquement**: tapez le préfixe `f:` (ou `folder:`) dans la recherche pour ne cibler que les noms de dossiers, avec un badge indiquant quand ce mode est actif.
- **Fichiers importés indiqués dans les exports**: l'export d'une conversation liste désormais par leur nom les fichiers non-images que vous avez joints, pour ne pas perdre ce contexte.
- **Affichage des notes de version au choix**: laissez Voyager ouvrir automatiquement les nouveautés après une mise à jour, ou afficher seulement un badge `NEW` jusqu'à ce que vous les ouvriez.

### Corrections

- **Suppression de filigrane plus intelligente et plus large**: prend en charge les derniers types de filigrane de Gemini et davantage de tailles de logo (y compris les petites images et les grandes images réduites), réussit sur davantage de cas limites, et ne s'exécute toujours que lorsqu'un filigrane est réellement détecté. Les pages Notebook (NotebookLM) ne sont plus perturbées, Safari télécharge à nouveau l'image sans filigrane en taille réelle, et les échecs se rabattent sur un téléchargement normal.
- **Indicateur d'utilisation plus fiable**: fonctionne de façon constante sur les navigateurs Chromium (Chrome / Edge), ne saute plus à une valeur plus basse erronée à cause de données périmées, conserve le compte à rebours de réinitialisation après un rafraîchissement et affiche un lien cliquable quand aucune donnée n'est présente.
- **Dossiers plus solides**: les affectations de dossier survivent au défilement de la barre latérale de Gemini (virtualisation), cliquer sur une conversation ouvre bien la bonne, le renommage utilise la boîte de dialogue native de Gemini et reste synchronisé, et les imports ne cassent plus en cas de contention.
- **Les brouillons restent avec leur conversation**: un brouillon non envoyé reste dans la conversation où vous l'avez saisi et n'est pas écrasé quand vous changez de discussion.
- **Le tour d'accueil ne se ferme plus par accident**: cliquer dans la page pendant le tour ne l'arrête plus — seule une fermeture explicite ou Échap le fait.
- **La surbrillance devient optionnelle**: si vous n'avez jamais utilisé la surbrillance, elle démarre désormais désactivée (les surbrillances existantes restent actives et vos données sont inchangées).
- **Performances et divers**: démarrage des fonctions plus rapide et mémoire réduite dans les longues conversations, les réglages du popup défilent immédiatement, Mermaid en plein écran se nettoie à la fermeture, l'aperçu de la timeline reste visible, l'export gère les messages chargés à la volée, la validation des plugins bloque les URL distantes et à schéma script, et l'isolation multi-comptes est plus robuste.
