# Comportement d'envoi

::: info
**Remarque** : cette fonctionnalité est disponible à partir de la version 1.3.7.
:::

Changez le raccourci d'envoi en `Ctrl+Entrée` (ou `⌘+Entrée` sur macOS) : `Entrée` devient alors une touche de saut de ligne, ce qui facilite la rédaction de prompts sur plusieurs lignes.

## Pourquoi cette fonctionnalité

Par défaut, appuyer sur `Entrée` envoie immédiatement le message. Lorsque vous rédigez des prompts plus longs, collez du code sur plusieurs lignes ou mettez en forme votre saisie, cela provoque souvent des envois accidentels : vous vouliez simplement aller à la ligne, mais le message est déjà parti.

Une fois activé :

- **Entrée** → insérer un saut de ligne
- **Ctrl+Entrée** (macOS : **⌘+Entrée**) → envoyer le message

Maj+Entrée et la saisie par méthode IME gardent le comportement propre au site, et Ctrl/⌘+Entrée attend qu'une pièce jointe ait fini de se téléverser.

## Comment l'activer

1. Ouvrez la fenêtre de Voyager.
2. Dans **Options de saisie**, activez **Ctrl+Entrée pour envoyer** (affiché **⌘+Entrée pour envoyer** sur macOS).

## Autres sites

- **AI Studio** fonctionne à l'inverse : activez **Entrée pour envoyer dans AI Studio** pour envoyer avec `Entrée`, et ajouter un saut de ligne avec `Ctrl/⌘+Entrée`.
- **Claude, ChatGPT et DeepSeek** : installez l'extension **Ctrl/Cmd+Entrée pour envoyer** pour ce site depuis le [Marketplace](/fr/plugins).
- **Safari** : si Gemini demande d'appuyer deux fois sur Entrée pour envoyer, activez **Corriger la touche Entrée sur Safari**.

## Caractéristiques

- **Aucun surcoût de performance** : lorsque la fonctionnalité est désactivée, aucun écouteur d'événements clavier n'est actif, sans aucun impact sur les performances de la page.
- **Bascule instantanée** : les changements prennent effet dès leur activation dans les paramètres, sans rechargement de la page.
