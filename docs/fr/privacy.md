# Politique de Confidentialité

Dernière mise à jour : 16 mars 2026

## Introduction

Voyager ("nous", "notre", ou "nos") s'engage à protéger votre vie privée. Cette Politique de Confidentialité explique comment notre extension de navigateur collecte, utilise et protège vos informations.

## Collecte et Utilisation des Données

**Nous ne collectons aucune information personnelle.**

Voyager fonctionne entièrement dans votre navigateur. Toutes les données générées ou gérées par l'extension (comme les dossiers, les modèles de prompts, les messages favoris et les paramètres) sont stockées :

1. Localement sur votre appareil (`chrome.storage.local`)
2. Dans le stockage synchronisé de votre navigateur (`chrome.storage.sync`) s'il est disponible, pour synchroniser les paramètres entre vos appareils.

Nous n'avons accès à aucune de vos données personnelles, historiques de chat ou autres informations privées. Nous ne suivons pas votre historique de navigation.

## Synchronisation Google Drive (Optionnelle)

Si vous activez explicitement la fonction de synchronisation Google Drive, l'extension utilise l'API Chrome Identity pour obtenir un jeton OAuth2 (avec le scope `drive.file` uniquement) afin de sauvegarder vos dossiers et prompts sur **votre propre Google Drive**. Ce transfert s'effectue directement entre votre navigateur et les serveurs de Google. Nous n'avons pas accès à ces données et elles ne sont jamais envoyées à un serveur que nous exploitons.

## Permissions

L'extension demande le minimum de permissions nécessaires pour fonctionner :

- **Storage (Stockage)** : Pour enregistrer vos préférences, dossiers, prompts, messages favoris et options de personnalisation de l'interface localement et entre vos appareils.
- **Identity (Identité)** : Pour l'authentification Google de la fonction optionnelle de synchronisation Google Drive. Utilisé uniquement lorsque vous activez explicitement la synchronisation cloud.
- **Scripting (Scripts)** : Pour injecter dynamiquement des scripts de contenu sur les pages Gemini et sur les sites web personnalisés spécifiés par l'utilisateur pour la fonction Gestionnaire de Prompts. Seuls les scripts intégrés à l'extension sont injectés — aucun code distant n'est récupéré ou exécuté.
- **Host Permissions (Permissions d'hôte)** (gemini.google.com, aistudio.google.com, etc.) : Pour injecter des scripts de contenu qui améliorent l'interface Gemini avec des fonctionnalités comme les dossiers, l'exportation, la timeline et la citation de réponse. Les domaines Google supplémentaires (googleapis.com, accounts.google.com) sont nécessaires pour l'authentification de la synchronisation Google Drive.
- **Optional Host Permissions (Permissions d'hôte optionnelles)** (toutes les URL) : Demandées uniquement au moment de l'exécution lorsque vous ajoutez explicitement des sites web personnalisés pour le Gestionnaire de Prompts. Jamais activées sans votre action.

## Services Tiers

Voyager ne partage aucune donnée avec des services tiers, des annonceurs ou des fournisseurs d'analyse.

## Modifications de cette Politique

Nous pouvons mettre à jour notre Politique de Confidentialité de temps à autre. Nous vous informerons de tout changement en publiant la nouvelle Politique de Confidentialité sur cette page.

## Nous Contacter

Si vous avez des questions concernant cette Politique de Confidentialité, veuillez nous contacter via notre [Dépôt GitHub](https://github.com/Nagi-ovo/gemini-voyager).
