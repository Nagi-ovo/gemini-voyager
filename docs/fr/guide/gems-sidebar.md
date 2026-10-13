# Gems récents dans la barre latérale

Le redesign de Gemini en 2026 a d'abord déplacé les Gems derrière le menu des paramètres, puis a discrètement remis une entrée de navigation dans la barre latérale — mais ce n'est qu'un lien qui vous renvoie vers `/gems/view`.

Voyager permet à cette entrée native Gems de « se déployer » en une liste de vos gems, directement dans la barre latérale : les gems épinglés d'abord, puis ceux que vous avez utilisés le plus récemment.

## À quoi cela ressemble

- **Rattaché à l'entrée native Gems.** En retrait, aligné sur le libellé « Gems » de Gemini, pour se lire comme une sous-liste de cette entrée et non comme un panneau ajouté.
- **Bouton de bascule en chevron.** Un petit bouton `›` à droite de l'entrée Gems pivote en `⌄` lorsqu'il est ouvert. Cliquez pour replier ou déployer. L'état est enregistré localement et synchronisé entre les onglets.
- **Utilisés récemment en premier.** Ouvrir un gem, qu'il soit de vous ou l'un des gems prédéfinis de Google, le place en tête de liste.
- **Les gems épinglés restent en place.** Les gems épinglés passent toujours en premier, dans l'ordre où vous les avez épinglés, et ne comptent pas dans la limite du curseur.
- **Aucun trafic réseau.** Tout provient de ce que Voyager voit sur les pages que vous ouvrez. Aucun appel API, aucune interrogation périodique, aucune récupération en arrière-plan.

## Mode d'emploi

1. Ouvrez la fenêtre de Voyager (icône de l'extension dans la barre d'outils).
2. Repérez le curseur **Gems récents dans la barre latérale**. Il affiche 3 gems par défaut.
3. Faites glisser jusqu'au nombre souhaité (1 à 10). **`0` masque entièrement la section** : réglez-le à cette valeur si vous ne voulez pas de cette fonctionnalité.

Pour épingler l'un de vos gems, ouvrez `gemini.google.com/gems/view` et cliquez sur le bouton d'épingle de sa ligne (**Pin to sidebar**). Cliquez à nouveau pour le désépingler.

::: tip Première configuration
La liste se remplit au fil de l'utilisation : ouvrez un gem et il apparaît. Pour voir les gems que vous n'avez pas ouverts récemment, visitez une fois `gemini.google.com/gems/view` : Voyager prend discrètement un instantané de votre liste de gems.
:::

## Quand la liste se met à jour

- **Ouvrir un gem** (`/gem/<id>`) l'enregistre comme utilisé récemment.
- **Visiter `/gems/view`** actualise l'instantané de votre liste de gems ; réorganiser, renommer, créer ou supprimer un gem sur cette page est synchronisé immédiatement.
- Rien n'est lu depuis les autres pages.

Donc si vous ajoutez un gem depuis un autre appareil, Voyager ne le connaîtra pas « par magie ». Ouvrez-le, ou ouvrez `/gems/view`, une fois sur cet ordinateur.

## Confidentialité

- L'instantané de la liste de gems et l'historique d'utilisation récente restent dans le **stockage local du navigateur** (`chrome.storage.local`).
- La valeur du curseur et les identifiants des gems épinglés sont enregistrés avec vos autres réglages Voyager dans le **stockage de synchronisation du navigateur**, ce qui les suit sur les appareils connectés au même profil de navigateur. Les noms et les icônes ne sont jamais synchronisés.
- Nous ne lisons ni ne mettons en cache le contenu des conversations des gems : seulement le nom, la description, le lien et la première lettre pour l'avatar.
- Désactiver la fonctionnalité (nombre = 0) conserve les données locales, de sorte que la réactiver est instantané.

## Plateforme

Gemini uniquement (`gemini.google.com`). L'entrée Gems d'AI Studio a une autre structure et n'est pas prise en charge.
