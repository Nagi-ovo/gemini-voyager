# Gems récents dans la barre latérale

Le redesign de Gemini 2026 a d'abord déplacé les Gems derrière le menu des paramètres, puis a discrètement remis une entrée de navigation en haut de la barre latérale — mais ce n'est qu'un lien qui vous renvoie vers `/gems/view`.

Voyager fait en sorte que cette entrée native Gems « se déploie » en une liste de vos gems les plus récents, directement dans la barre latérale.

## À quoi ça ressemble

- **Suspendu sous l'entrée native Gems.** Indenté pour s'aligner avec l'étiquette « Gems » de Gemini, afin qu'il se lise comme une sous-liste de cette entrée, et non comme un panneau collé.
- **Basculement avec chevron.** Un petit bouton `›` à droite de l'entrée Gems tourne vers `⌄` quand il est ouvert. Cliquez pour replier/déplier. L'état est conservé dans `chrome.storage.local` et synchronisé entre les onglets.
- **Zéro trafic réseau.** La liste est lue depuis un cache local rempli la dernière fois que vous avez visité `https://gemini.google.com/gems/view`. Aucun appel API, aucun polling, aucune récupération en arrière-plan.

## Comment l'utiliser

1. Ouvrez le popup Voyager (icône de l'extension dans la barre d'outils).
2. Trouvez le curseur **Gems récents dans la barre latérale**.
3. Faites glisser jusqu'au nombre souhaité (1–10). **`0` masque complètement la section** — laissez-le là si vous ne voulez pas la fonctionnalité.

::: tip Première configuration
Après l'activation, si vous ne voyez aucun gem, c'est que le cache local est vide. Visitez `gemini.google.com/gems/view` une fois — Voyager prendra silencieusement un instantané de votre liste de gems. La prochaine fois que vous serez sur une page Gemini, la liste sera là.
:::

## Quand le cache se rafraîchit

Voyager ne rafraîchit le cache que lorsque vous êtes **activement sur `/gems/view`** :

- Visiter la page, réorganiser, renommer, créer, supprimer un gem — tout est synchronisé dans le cache en temps réel.
- En dehors de `/gems/view`, aucun scraping ne se produit.

Donc si vous ajoutez un gem depuis un autre appareil, Voyager ne le saura pas « par magie ». Ouvrez `/gems/view` une fois sur cette machine et tout sera synchronisé.

## Confidentialité

- Les données restent dans le **stockage local du navigateur** (`chrome.storage.local`). Rien n'est envoyé ailleurs.
- Nous ne lisons ni ne mettons en cache le contenu des conversations du gem — uniquement le nom, la description, le lien et la première lettre pour l'avatar.
- Désactiver la fonctionnalité (nombre = 0) laisse le cache en place, donc réactiver est instantané.

## Plateforme

Gemini uniquement (`gemini.google.com`). L'entrée gem d'AI Studio a une forme différente et n'est pas couverte.
