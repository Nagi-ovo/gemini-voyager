# Comportement d'Envoi

::: info
**Note** : Cette fonctionnalité est disponible à partir de la version 1.3.7.
:::

Changez le raccourci d'envoi de Gemini en `Ctrl+Entrée` (`⌘+Entrée` sur macOS), transformant `Entrée` en touche de saut de ligne pour composer vos prompts multi-lignes sereinement.

## Pourquoi cette fonctionnalité

Par défaut, appuyer sur `Entrée` dans Gemini envoie immédiatement le message. Lors de la rédaction de prompts plus longs, du collage de code multi-lignes ou du formatage soigné de votre saisie, cela entraîne souvent des envois accidentels — vous vouliez juste un saut de ligne, mais le message est déjà parti.

Une fois activé :

- **Entrée** → Insérer un saut de ligne
- **Ctrl+Entrée** (macOS : **⌘+Entrée**) → Envoyer le message

## Comment activer

1. Ouvrez le panneau de paramètres de Voyager (popup).
2. Trouvez le bouton **Ctrl+Entrée pour envoyer**.
3. Activez-le.

## Caractéristiques

- **Zéro surcharge de performance** : Désactivé, aucun écouteur d'événement clavier n'est actif — aucun impact sur les performances de la page.
- **Basculement instantané** : Les changements prennent effet immédiatement après activation dans les paramètres, sans actualisation de page.
- **Compatible mode édition** : Fonctionne également lors de l'édition de messages précédemment envoyés.
