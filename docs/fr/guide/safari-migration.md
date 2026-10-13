# Migrer l'extension Safari

::: warning Une manipulation manuelle, à faire une seule fois
À partir de la **v1.6.0**, l'application hôte Safari est renommée de « **Gemini Voyager** » en « **Voyager** ». macOS identifie les applications par leur nom : installer directement la nouvelle version la laisse cohabiter avec l'ancienne, ce qui peut provoquer une extension en double ou un comportement confus. Effectuez ce remplacement une seule fois ; les mises à jour automatiques reprennent ensuite normalement.
:::

## Vos données sont préservées

L'identifiant de bundle de l'application n'a pas changé. Vos dossiers, votre bibliothèque de prompts, la synchronisation cloud et tous vos réglages sont conservés. Cette étape ne remplace que l'application elle-même : elle ne touche jamais à vos données.

## Étapes de migration

1. **Quittez Safari complètement** (appuyez sur `⌘Q` dans Safari, et ne fermez pas seulement la fenêtre).
2. Ouvrez **Finder → Applications** et glissez l'ancienne « **Gemini Voyager.app** » dans la Corbeille.
3. Ouvrez le DMG nouvellement téléchargé et glissez « **Voyager.app** » dans **Applications**.
4. Rouvrez Safari → **Réglages → Extensions**, puis activez « **Voyager Extension** ».

## Deux choses à ne pas faire

- ❌ **Ne gardez pas les deux applications.** Si l'ancienne « Gemini Voyager.app » reste en place, les deux extensions entreront en conflit.
- ❌ **Ne cliquez pas sur « Désinstaller » pour l'ancienne extension dans le volet Extensions de Safari.** Cela renvoie vers l'ancienne application et complique encore les choses. Glissez simplement l'ancienne application dans la Corbeille, comme à l'étape 2.

## Ensuite

Une fois ce remplacement effectué, les futures versions Safari mettront à jour le nouveau « Voyager » grâce au système de mise à jour automatique intégré (Sparkle) : plus besoin de remplacer l'application à la main.

Une question ? Écrivez-nous sur [GitHub Issues](https://github.com/voyager-crew/voyager/issues).
