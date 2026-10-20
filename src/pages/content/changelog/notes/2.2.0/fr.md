> _« Il va vous falloir un plus gros bateau. » — Brody, 《Les Dents de la mer》 (1975)_

### Points forts

- 🗂️ **:claude: :deepseek: Des dossiers sur Claude et DeepSeek** _(désactivé par défaut)_ : activez **Claude · Dossiers** ou **DeepSeek · Dossiers** dans la section Extensions du popup pour ranger vos conversations dans des dossiers de la barre latérale, comme sur ChatGPT.
- 🎨 **Un style plus calme et unifié** : le popup, le gestionnaire de prompts, l'export, la chronologie, les surlignages, les dossiers et les autres panneaux partagent désormais un même style, plus sobre, qui suit le thème clair ou sombre de chaque site, et le nom Voyager est dessiné en un nouveau logotype.
- ✅ **:chatgpt: Le pont local répond à la carte d'autorisation de ChatGPT** : quand ChatGPT demande d'autoriser Google Drive ou une autre app, l'option `--approve-apps` du Voyager CLI laisse l'extension cliquer à votre place (CLI 0.4.0 ou ultérieur).

### Nouveautés

- **:chatgpt: Le pont local enregistre les fichiers des réponses** : les fichiers proposés dans une réponse de ChatGPT sont enregistrés à côté de la réponse par le Voyager CLI (CLI 0.3.0 ou ultérieur).
- **Valeurs exactes dans les paramètres** : les paramètres à large plage ont une case numérique à côté du curseur, pour saisir la valeur exacte.

### Corrections

- **:gemini: Export des très longues conversations** : une très longue conversation Gemini ne fait plus échouer l'export ; Voyager exporte la partie chargée et indique que seule la partie la plus récente est incluse.
- **:gemini: Sélection des réponses à exporter** : les réponses de Gemini affichent de nouveau leur case à cocher, qui ne masque plus les premiers mots, et toutes les cases s'alignent sur une même colonne.
- **:gemini: Dossiers au-dessus de Notebooks** : après le changement de la barre latérale de Gemini, les dossiers peuvent de nouveau être placés au-dessus de Notebooks ou de vos conversations.
- **:chatgpt: Bouton d'export de ChatGPT** : le bouton d'export de l'en-tête s'aligne sur Partager et ne le recouvre plus quand une boîte de dialogue est ouverte.
- **:chatgpt: Pont local ChatGPT** : un envoi échoué retire son prompt de la zone de saisie au lieu d'y laisser un brouillon, un prompt contenant un lien Google Drive s'envoie normalement, et une réponse coupée par une perte de connexion n'est plus enregistrée comme la réponse.
- **Détails des dossiers** : la flèche des dossiers ne se transforme plus en tiret, les sept couleurs tiennent sur une ligne, les options de tri passent à la ligne dans un menu de paramètres étroit, et le bouton de sélection des conversations de DeepSeek n'est plus masqué.
- **Gestionnaire de prompts après une mise à jour** : mettre à jour ou recharger l'extension ne laisse plus le bouton et le panneau du gestionnaire de prompts sur la page.
