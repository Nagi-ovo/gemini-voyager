# Horodatage des Messages

::: info
**Note** : Cette fonctionnalité est disponible à partir de la version 1.3.7.
:::

Voyager affiche l'heure d'envoi de chaque message, vous aidant à retracer le fil complet de vos conversations.

## Introduction

Lorsque les conversations s'allongent, il devient difficile de se rappeler quand une discussion particulière a eu lieu.

Voyager annote chaque message avec un horodatage précis (format : `AAAA-MM-JJ HH:mm:ss`) au-dessus du message, et affiche la même heure au survol d'un point de la chronologie.

## Comment l'activer

1. Ouvrez le panneau de paramètres Voyager (l’icône de l’extension dans la barre d’outils de votre navigateur).
2. Activez **Extensions** → **Horodatage des messages** (marqué **Expérimental**, désactivé par défaut).

## D'où viennent les heures

- **Gemini** : Voyager lit l'heure d'envoi réelle de chaque message dans les données de conversation de Gemini lui-même ; les heures sont donc justes même pour les conversations menées sur un autre appareil ou avant l'installation de Voyager. Ce n'est que lorsque cette heure est indisponible que Voyager se rabat sur l'heure à laquelle il a vu le message pour la première fois, conservée localement dans votre navigateur.
- **ChatGPT** : Voyager enregistre l'heure de chaque message que vous envoyez tant que l'option est activée. Ces heures sont conservées localement dans votre navigateur ; les messages envoyés auparavant, ou depuis un autre appareil, n'ont pas d'horodatage.

## Caractéristiques

- **Précision à la seconde** : Date et heure complètes, idéal pour revoir de longues conversations.
- **Zéro distraction** : L'information temporelle est présentée discrètement sans affecter l'expérience de lecture.

## Cas d'utilisation

- **Historique de travail** : Revoir quand une décision particulière a été prise.
- **Notes d'étude** : Marquer quand un concept a été discuté pour une révision ultérieure.
- **Revue de longues conversations** : Dans des conversations approfondies sur plusieurs jours, distinguer clairement les discussions de différentes périodes.

## Plateforme

**Google Gemini** (`gemini.google.com`) et **ChatGPT** (`chatgpt.com`). Non disponible sur Claude ni DeepSeek.
