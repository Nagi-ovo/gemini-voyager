# Vos actifs intellectuels : bibliothèque de prompts

Vous rédigez un prompt parfait. Il résout un problème de code complexe ou écrit un e-mail magnifique.
Le jetez-vous ?
Non. Vous le sauvegardez.

## Le coffre-fort de prompts

C'est votre dépôt personnel de génie.

### 1. Capturer

Quand vous écrivez quelque chose de génial, cliquez sur le bouton Voyager flottant (il se trouve par défaut à côté de la zone de saisie, et vous pouvez le déplacer où vous voulez) pour ouvrir le **Gestionnaire de prompts**.
Il fait désormais partie de votre coffre-fort.

### 2. Catégoriser

Ajoutez des étiquettes comme `coding`, `email` ou `research` (séparez-les par des virgules).
Gardez vos outils affûtés et bien rangés.

### 3. Déployer

La prochaine fois que vous en aurez besoin, ne le retapez pas.
Ouvrez le gestionnaire, cherchez par étiquette ou mot-clé, puis cliquez pour insérer.
Un clic. Un levier infini.

![Gestionnaire de prompts](/assets/gemini-prompt-manager.png)

## Liste compacte et notes

Lorsque les prompts s'accumulent et que la liste de cartes ne suffit plus, le panneau s'adapte :

### Changer de vue

Le bouton `≡ / ▦` à droite de la barre de recherche bascule entre **Liste compacte** (par défaut) et **Vue confortable**.

- **Liste compacte** : un prompt par ligne, environ 10 visibles à la fois ; à droite, les actions étiquettes · développer · modifier · supprimer
- **Vue confortable** : aperçu Markdown complet, idéal pour une petite collection

### Nom obligatoire

Le champ **Nom** en haut du formulaire d'ajout ou de modification donne à chaque prompt un titre court ; il est obligatoire à la création comme à la modification. Les anciens prompts sans nom restent disponibles, mais devront recevoir un nom à leur prochaine modification.

### Aperçu rapide au survol

En mode compact, survolez une ligne pendant **environ 250 ms** pour voir son contenu complet dans une info-bulle flottante. Elle remplace l'info-bulle `title` native du navigateur, qui peut mettre de 1 à 3 s à apparaître.

### Insertion rapide avec la barre oblique

Dans la zone de saisie d'une discussion, tapez `/` suivi d'une partie du nom d'un prompt. La liste affiche les noms et étiquettes correspondants ; survolez un élément pour prévisualiser son contenu, puis cliquez dessus ou appuyez sur `Tab` / `Entrée` pour le choisir. L'éditeur affiche le nom choisi sous forme de jeton surligné et envoie le contenu complet du prompt.

![Vue en liste compacte](/assets/gemini-prompt-manager-compact.png)

## Disponible partout

Le Gestionnaire de prompts peut désormais être utilisé sur n'importe quel site de votre choix, et plus seulement sur Gemini™ et AI Studio.

### Comment l'activer

Sur Claude, ChatGPT et DeepSeek, ouvrez la fenêtre de Voyager pendant que vous êtes sur le site et activez l'interrupteur du site (par exemple **Activer le gestionnaire de prompts sur Claude**). Il vous sera demandé d'accorder l'accès.

Pour tout autre site :

1. Cliquez sur l'icône Voyager dans la barre d'outils de votre navigateur.
2. Faites défiler jusqu'à la section **Gestionnaire de prompts**.
3. Saisissez l'URL du site (par exemple `chatgpt.com` ou `claude.ai`).
4. Cliquez sur **Ajouter** puis accordez l'autorisation.
5. **Rechargez la page cible** pour voir le bouton flottant.

### Sites IA populaires

- `chatgpt.com` - ChatGPT
- `claude.ai` - Claude
- `copilot.microsoft.com` - Microsoft Copilot
- `poe.com` - Poe

### Applications locales

Les adresses locales fonctionnent aussi : saisissez `localhost:3080` ou `127.0.0.1:3080` de la même manière. Par exemple, [DeepSeek Harness](/fr/guide/deepseek-harness) tourne sur `localhost:3080`, et le Gestionnaire de prompts s'y rattache comme à n'importe quel site hébergé.

![Gestionnaire de prompts dans DeepSeek Harness](/assets/prompt-manager-deepseek-harness.png)

::: tip
Sur les sites que vous ajoutez vous-même, **seul** le Gestionnaire de prompts est activé. Des fonctions comme la chronologie et les dossiers ne se chargent pas sur ces sites. Claude, ChatGPT et DeepSeek fonctionnent autrement : ils disposent de leurs propres extensions officielles, que vous pouvez parcourir dans le [Marketplace](/fr/plugins).
:::
