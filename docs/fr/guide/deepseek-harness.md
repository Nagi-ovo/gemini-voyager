# DeepSeek Harness

L'agent de codage open source de DeepSeek. Il tourne sur votre machine.

Il dispose d'une interface web, à l'adresse `localhost:3080`.

Une interface web signifie que Voyager peut s'y connecter.

## Pourquoi ça marche

Le Gestionnaire de prompts de Voyager ne regarde pas les domaines. Il regarde les sites que vous avez ajoutés.

Une adresse locale est un site.

DeepSeek Harness n'a donc rien de différent de Gemini, Claude ou ChatGPT : c'est un endroit de plus où vos prompts peuvent vous suivre.

## Trois étapes

### 1. Lancer DSH

```bash
npm i -g @deepseek-ai/dsh
dsh web
```

Ouvrez `http://localhost:3080` dans votre navigateur.

### 2. Activer l'interrupteur dans la fenêtre de l'extension

![Cliquez sur l'icône puzzle de la barre d'outils, cliquez sur Voyager, puis activez le Gestionnaire de prompts sur localhost:3080](/assets/dsh-enable-steps-en.png)

Comme vous êtes déjà sur `localhost:3080`, la fenêtre le propose tout en haut. Activez-le et accordez l'accès.

Rien à saisir.

### 3. Recharger la page

Le bouton flottant apparaît en bas à droite.

![Gestionnaire de prompts dans DeepSeek Harness](/assets/prompt-manager-deepseek-harness.png)

## Une seule bibliothèque, partout

Vous n'avez pas une bibliothèque par site. Vous en avez une seule, et elle vous suit.

Chaque prompt enregistré sur Gemini, Claude ou ChatGPT est déjà là lorsque vous ouvrez DSH, tous sans exception. Et l'inverse est vrai aussi : écrivez un prompt dans DSH, il vous attendra sur Gemini.

Mêmes étiquettes, mêmes favoris, même recherche.

![Une seule bibliothèque qui atteint toutes les interfaces](/assets/one-prompt-library.png)

## Quelques remarques

**Le port n'est pas figé.** DSH est encore une préversion pour développeurs, et son port par défaut peut changer. Le cas échéant, ajoutez simplement le nouveau.

**Seul le Gestionnaire de prompts se charge.** Sur un site personnalisé comme DSH, la chronologie, les dossiers et le reste ne démarrent pas. (Sur le site de DeepSeek lui-même, beaucoup d'entre eux sont disponibles sous forme d'extensions officielles.)

**Vos prompts ne quittent jamais la machine.** DSH est local, et la bibliothèque de Voyager est locale. Rien ne sort de cette chaîne.

::: tip
La même méthode fonctionne pour n'importe quelle interface web locale : Open WebUI, LibreChat, ou celle que vous avez écrite vous-même. Ajoutez l'adresse, rechargez, c'est fait.
:::
