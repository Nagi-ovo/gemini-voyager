# Gems récents dans la barre latérale

Le redesign de Gemini 2026 a d'abord déplacé les Gems derrière le menu des paramètres, puis a discrètement remis une entrée de navigation en haut de la barre latérale — mais ce n'est qu'un lien qui vous renvoie vers `/gems/view`.

Voyager fait en sorte que cette entrée native Gems « se déploie » en une liste de vos gems, directement dans la barre latérale : les gems épinglés d'abord, puis ceux que vous avez utilisés le plus récemment.

## À quoi ça ressemble

- **Suspendu sous l'entrée native Gems.** Indenté pour s'aligner avec l'étiquette « Gems » de Gemini, afin qu'il se lise comme une sous-liste de cette entrée, et non comme un panneau collé.
- **Basculement avec chevron.** Un petit bouton `›` à droite de l'entrée Gems tourne vers `⌄` quand il est ouvert. Cliquez pour replier/déplier. L'état est conservé localement et synchronisé entre les onglets.
- **Utilisés récemment en premier.** Ouvrir un gem — le vôtre ou l'un des gems prédéfinis de Google — le place en tête de liste.
- **Les gems épinglés restent en place.** Les gems épinglés passent toujours en premier, dans l'ordre où vous les avez épinglés, et ne comptent pas dans la limite du curseur.
- **Zéro trafic réseau.** Tout provient de ce que Voyager voit sur les pages que vous ouvrez. Aucun appel API, aucun polling, aucune récupération en arrière-plan.

## Comment l'utiliser

1. Ouvrez le popup Voyager (icône de l'extension dans la barre d'outils).
2. Vérifiez que **Extensions** → **Gems récents dans la barre latérale** est activé (c'est le cas par défaut). Tant qu'il est activé, un curseur de nombre apparaît sous la ligne ; il affiche 3 gems par défaut.
3. Faites glisser jusqu'au nombre souhaité (1–10). **`0` masque seulement la liste des Gems récents** ; cela ne désactive pas la fonctionnalité. Pour la désactiver, coupez l'interrupteur de la ligne.

Pour épingler l'un de vos gems, ouvrez `gemini.google.com/gems/view` et cliquez sur le bouton d'épingle de sa ligne (**Pin to sidebar**). Cliquez à nouveau pour le désépingler.

::: tip Première configuration
La liste se remplit au fil de l'utilisation : ouvrez un gem et il apparaît. Pour voir les gems que vous n'avez pas ouverts récemment, visitez `gemini.google.com/gems/view` une fois — Voyager y prendra silencieusement un instantané de votre liste de gems.
:::

## Quand la liste se met à jour

- **Ouvrir un gem** (`/gem/<id>`) l'enregistre comme utilisé récemment.
- **Visiter `/gems/view`** rafraîchit l'instantané de votre liste de gems ; réorganiser, renommer, créer, supprimer un gem sur cette page — tout est synchronisé en temps réel.
- Aucune autre page n'est lue.

Donc si vous ajoutez un gem depuis un autre appareil, Voyager ne le saura pas « par magie ». Ouvrez-le, ou ouvrez `/gems/view`, une fois sur cette machine.

## Confidentialité

- L'instantané de la liste de gems et l'historique d'utilisation récente restent dans le **stockage local du navigateur** (`chrome.storage.local`).
- La valeur du curseur et les identifiants des gems épinglés sont enregistrés avec vos autres réglages Voyager dans le **stockage de synchronisation du navigateur**, ce qui les suit sur les appareils connectés au même profil de navigateur. Les noms et les icônes ne sont jamais synchronisés.
- Nous ne lisons ni ne mettons en cache le contenu des conversations du gem — uniquement le nom, la description, le lien et la première lettre pour l'avatar.
- Désactiver la fonctionnalité (nombre = 0) laisse les données locales en place, donc réactiver est instantané.

## Plateforme

Gemini uniquement (`gemini.google.com`). L'entrée gem d'AI Studio a une forme différente et n'est pas couverte.
