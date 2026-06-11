# Barre de statut d’usage

Gemini 2026 a ajouté des limites d’usage aux conversations, mais pour voir ce qu’il vous reste, vous devez vous rendre sur la page complète `gemini.google.com/usage`.

Voyager transforme vos limites **quotidienne** et **hebdomadaire** en une petite **barre flottante déplaçable** qui vit directement dans l’interface du chat — un coup d’œil à tout moment, sans quitter la conversation.

![Barre de statut d’usage](/assets/gemini-usage-status.png)

## À quoi ça ressemble

Une mini-barre compacte : un badge de forfait (par ex. `PRO`), deux fines barres de progression (quotidienne / hebdomadaire) avec des pourcentages, un bouton de rafraîchissement et une petite icône qui ouvre la page d’usage native. Translucide et discrète — elle reste à l’écart de la conversation.

## Comment ça marche

- **Déplaçable + retient sa place** : attrapez la barre n’importe où et déposez-la là où ça vous arrange ; la position persiste à travers les rechargements, la navigation et les onglets. Par défaut, elle est centrée juste au-dessus de la zone de saisie.
- **Se rafraîchit silencieusement en arrière-plan** : les données se mettent à jour toutes seules — **vous n’avez jamais besoin de recharger la page ni d’ouvrir `/usage`**. Elle se rafraîchit quelques secondes après la fin de chaque réponse (juste au moment où votre usage change), avec un repli prudent en cas d’inactivité toutes les quelques minutes.
- **Survolez pour les détails** : survolez une barre pour voir l’heure de réinitialisation de ce quota ; survolez la barre entière pour voir « Mis à jour à l’instant / Mis à jour il y a X min ».
- **Deux commandes au rôle précis** :
  - **Rafraîchir ↻** — forcer une mise à jour silencieuse immédiate (elle tourne et se met à jour sur place ; **ne navigue jamais**).
  - **Ouvrir ↗** — ouvrir la page `/usage` native dans un nouvel onglet. C’est la **seule** chose de la barre qui navigue.

## Comment l’utiliser

1. Ouvrez le panneau de paramètres Voyager (l’icône de l’extension dans la barre d’outils de votre navigateur).
2. Activez l’interrupteur **Barre de statut d’usage** (désactivé par défaut).
3. La barre flottante apparaît immédiatement dans l’interface du chat — déplacez-la où vous voulez.

::: tip Fonctionne sans configuration
Une fois activé, Voyager récupère votre usage en arrière-plan automatiquement — **vous n’avez pas besoin de visiter `/usage` d’abord**. Si Google venait à changer son API interne et que les chiffres cessaient d’arriver, ouvrez simplement `gemini.google.com/usage` une fois et Voyager se recalibre sur les valeurs réelles affichées sur cette page.
:::

## Fréquence de mise à jour et détection

Les mises à jour sont **pilotées par les événements** : la barre ne se rafraîchit qu’après que votre usage a réellement changé (c’est-à-dire après l’envoi d’un message), avec un repli prudent en cas d’inactivité — **aucun polling intensif**. Chaque rafraîchissement est exactement la même requête que la page utilise elle-même pour récupérer l’usage, faite avec votre propre session connectée, à une cadence humaine. Le volume de requêtes est à peu près « une fois par tour de conversation », l’impact sur la détection de Google est donc négligeable.

## Confidentialité

- Les chiffres d’usage et la position de la barre sont stockés **localement uniquement** (`chrome.storage.local`) — rien n’est envoyé à un quelconque serveur.
- Elle ne lit ni ne met en cache aucun contenu de conversation — seulement les deux pourcentages, les heures de réinitialisation et le nom du forfait.
- Désactivez l’interrupteur et la barre disparaît ; le cache reste local, donc la réactiver ne nécessite aucun rechargement.

## Plateforme

**Google Gemini** uniquement (`gemini.google.com`).
