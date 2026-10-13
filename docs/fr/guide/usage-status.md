# Barre d'état d'utilisation

Gemini 2026 a ajouté des limites d'utilisation aux conversations, mais pour voir ce qu'il vous reste, il faut aller sur la page complète `gemini.google.com/usage`.

Voyager transforme vos limites **quotidienne** et **hebdomadaire** en une petite **barre flottante déplaçable**, qui vit directement dans l'interface de discussion. Un coup d'œil suffit, sans quitter la conversation.

![Barre d'état d'utilisation](/assets/gemini-usage-status.png)

## À quoi elle ressemble

Une mini-barre compacte : un badge de forfait (par exemple `PRO`), deux fines barres de progression (quotidienne et hebdomadaire) avec leurs pourcentages, un bouton d'actualisation et une petite icône qui ouvre la page d'utilisation native. Translucide et discrète, elle reste à l'écart de la conversation.

## Comment elle fonctionne

- **Déplaçable et mémorise sa place** : saisissez la barre n'importe où et déposez-la là où elle vous convient ; sa position est conservée lors des rechargements, de la navigation et entre les onglets. Par défaut, elle est centrée juste au-dessus de la zone de saisie.
- **Se met à jour silencieusement en arrière-plan** : les données se rafraîchissent d'elles-mêmes. **Vous n'avez jamais besoin de recharger la page ni d'ouvrir `/usage`**. Elle se met à jour quelques secondes après la fin de chaque réponse (au moment même où votre utilisation change), avec une mise à jour de secours prudente toutes les quelques minutes lorsque rien ne se passe.
- **Survolez pour voir les détails** : survolez une barre pour connaître l'heure de réinitialisation de ce quota ; survolez l'ensemble de la barre pour lire « Mis à jour à l'instant » ou « Mis à jour il y a X min ».
- **Deux commandes aux rôles bien définis** :
  - **Actualiser ↻** : force une mise à jour silencieuse immédiate (l'icône tourne et les valeurs se mettent à jour sur place ; **cela ne navigue jamais**).
  - **Ouvrir ↗** : ouvre la page `/usage` native dans un nouvel onglet. C'est **la seule** action de la barre qui conduit à une autre page.

## Mode d'emploi

1. Ouvrez le panneau des paramètres de Voyager (l'icône de l'extension dans la barre d'outils du navigateur).
2. Activez l'interrupteur **Barre d'état d'utilisation** (désactivé par défaut).
3. La barre flottante apparaît immédiatement dans l'interface de discussion ; déplacez-la où vous voulez.

::: tip Fonctionne tout de suite
Une fois activée, Voyager récupère automatiquement votre utilisation en arrière-plan : **inutile de visiter `/usage` au préalable**. Si Google modifie un jour son API interne et que les chiffres cessent d'arriver, ouvrez une fois `gemini.google.com/usage` : Voyager se recalibre alors sur les valeurs réelles affichées sur cette page.
:::

## Fréquence de mise à jour et détection

Les mises à jour sont **déclenchées par les événements** : la barre ne se rafraîchit qu'une fois votre utilisation réellement modifiée (c'est-à-dire après l'envoi d'un message), plus une mise à jour de secours prudente lorsque rien ne se passe. **Il n'y a pas d'interrogation serrée**. Chaque actualisation est exactement la même requête que celle que la page utilise elle-même pour récupérer l'utilisation, effectuée avec votre propre session connectée, à un rythme humain. Le volume de requêtes correspond à peu près à « une fois par échange », si bien que l'impact sur la détection de Google est négligeable.

## Confidentialité

- Les chiffres d'utilisation et la position de la barre sont stockés **uniquement en local** (`chrome.storage.local`) : rien n'est envoyé à un serveur.
- Elle ne lit ni ne met en cache aucun contenu de conversation : seulement les deux pourcentages, les heures de réinitialisation et le nom du forfait.
- Si vous désactivez l'interrupteur, la barre disparaît ; le cache reste local, si bien que la réactiver ne nécessite aucun rechargement.

## Plateforme

**Google Gemini** (`gemini.google.com`) uniquement.
