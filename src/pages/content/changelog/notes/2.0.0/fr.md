> _« Prends ton navire le plus rapide et ton meilleur équipage, et cap sur l'horizon. » — Pénélope, 《L'Odyssée》 (2026)_

### Points forts

- 🧩 **Écrivez vos propres plugins** : décrivez un changement en une phrase dans la carte des plugins locaux de la popup, faites-le écrire par n'importe quelle IA, et Voyager vérifie la réponse et montre ce qu'elle va changer avant de l'importer (désactivé). Un agent de code peut aussi l'écrire. [→ Documentation](/guide/write-a-plugin)
- 📁 **:chatgpt: Dossiers ChatGPT** : rangez vos discussions dans des dossiers, directement dans la barre latérale de ChatGPT, avec imbrication, réorganisation par glisser-déposer, sélection multiple, recherche `f:`, vue Activité et synchronisation cloud.
- 🔌 **21 nouveaux plugins officiels** pour :chatgpt: ChatGPT, :claude: Claude et :deepseek: DeepSeek, d'une chronologie pour ChatGPT à la citation de réponse, en passant par la sauvegarde automatique des brouillons et la copie de tableaux. Tous démarrent désactivés.
- 📚 **Page Bibliothèque enregistrée** : les messages favoris et les surlignages s'ouvrent dans leur propre onglet, avec les mêmes filtres, la même recherche et les mêmes cartes que la popup.

### Nouveautés

- **:chatgpt: Chronologie ChatGPT** _(désactivé par défaut)_ : passez d'un prompt à l'autre et mettez-les en favoris, comme sur Gemini et Claude.
- **Citer et répondre** _(désactivé par défaut)_ : sélectionnez du texte dans une réponse de ChatGPT, Claude ou DeepSeek et citez-le dans votre brouillon.
- **Ctrl/⌘+Entrée pour envoyer** _(désactivé par défaut)_ : Entrée ajoute une nouvelle ligne sur ChatGPT, Claude et DeepSeek ; Ctrl/⌘+Entrée envoie.
- **Sauvegarde automatique des brouillons** _(désactivé par défaut)_ : le texte non envoyé sur :claude: Claude et :deepseek: DeepSeek est conservé sur cet appareil et revient après un rechargement.
- **Compteur de brouillon** _(désactivé par défaut)_ : un décompte en direct des caractères, mots ou lignes au-dessus de la zone de message sur ChatGPT, Claude et DeepSeek.
- **Typographie de lecture** _(désactivé par défaut)_ : taille du texte, interligne et espacement des paragraphes des réponses sur ChatGPT, Claude et DeepSeek.
- **:deepseek: Extras DeepSeek** _(désactivé par défaut)_ : copier les tableaux en Markdown ou TSV, replier les longs blocs de code et copier la section de réflexion.
- **:chatgpt: Extras ChatGPT** _(désactivé par défaut)_ : diagrammes ECharts et WaveDrom, longs messages repliables et LaTeX dans vos propres messages.
- **Dossier de recherche** _(désactivé par défaut)_ : rassemblez des réponses :gemini: Gemini avec leurs prompts et leurs sources dans un seul dossier Markdown, puis copiez-le, téléchargez-le ou poursuivez dans ChatGPT ou Claude.
- **Plus de synchronisation cloud** : les dossiers ChatGPT ont leur propre synchronisation, et les plans et favoris des chronologies de ChatGPT, Claude et DeepSeek sont désormais sauvegardés sur Google Drive.
- **Des chronologies alignées sur Gemini** : les chronologies de ChatGPT, Claude et DeepSeek gagnent les styles Nœuds, Compact et Graduations, les raccourcis et les aperçus, réglables depuis la popup.
- **Les prompts favoris gardent tout leur texte** : les cartes se déplient pour l'afficher, et la recherche le couvre.
- **Alerte de fonction cassée** : quand une mise à jour de :gemini: Gemini casse une fonction de Voyager, la popup le signale et propose un lien de rapport respectueux de la vie privée.
- **Un seul style pour les notifications** : toasts et confirmations partagent un design empilable et assorti au thème, au lieu des alertes du navigateur.
- **:gemini: Interrupteur du filigrane Gemini** : la suppression est désormais désactivée sur les nouvelles installations. En cas de mise à jour, votre réglage actuel est conservé.

### Corrections

- **Un favori retiré reste retiré** : un message retiré des favoris ne revient plus après la synchronisation cloud.
- **:chatgpt: Export ChatGPT** : les longues discussions s'exportent de nouveau en entier, avec progression et bouton Annuler, et les blocs de code s'exportent comme du code.
- **:gemini: Barre latérale Gemini** : le chargement des anciennes discussions ne se bloque plus avec les dossiers et la sauvegarde automatique des brouillons activés (#1040).
- **Dossiers plus sûrs** : plusieurs onglets ouverts n'écrasent plus les modifications de dossiers les uns des autres, et une lecture ratée ne peut plus effacer vos dossiers.
- **Bibliothèque de prompts** : les modifications dans plusieurs onglets, les imports et les fusions Drive conservent votre ordre, vos épingles et vos dernières modifications.
- **Modèle par défaut** : fonctionne avec les niveaux de réflexion Faible, Moyen et Élevé de Gemini.
- **Export Markdown** : conserve toutes les images au lieu de s'arrêter à 40.
- **Ouvrir les favoris** : les messages ChatGPT et DeepSeek mis en favoris s'ouvrent sur leur propre site.
- **:chatgpt: Thème ChatGPT** : Voyager suit le thème clair ou sombre de ChatGPT plutôt que celui du système.
- **Après une mise à jour** : les onglets ouverts n'affichent plus les panneaux de Voyager en double.
- **:aistudio: AI Studio** : les dossiers supprimés restent supprimés, et les actions sur les dossiers ne rechargent plus la page.
- **Restauration Drive** : les forks de conversation sont aussi restaurés.
- **Forks :gemini: Gemini** : ouvrir un fork ne recharge plus la page.
- **Notifications de réponse terminée** : une fois autorisées dans la demande d’autorisation du navigateur, elles restent activées.
