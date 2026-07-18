# Migration de l'extension Safari

::: warning Une manipulation manuelle est nécessaire, une seule fois
À partir de la **v1.6.0**, l'application hôte Safari est renommée de « **Gemini Voyager** » en « **Voyager** ». macOS identifie les applications par leur nom : installer directement la nouvelle version la laisse cohabiter avec l'ancienne, ce qui peut provoquer une extension en double ou un comportement confus. Effectuez ce remplacement une fois, et les mises à jour automatiques reprennent normalement ensuite.
:::

## Vos données sont préservées

L'identifiant Bundle de l'application n'a pas changé. Vos dossiers, votre bibliothèque de prompts, la synchronisation cloud et tous vos réglages sont conservés. Cette étape remplace seulement l'application elle-même, sans toucher à vos données.

## Étapes de migration

1. **Quittez Safari complètement** (appuyez sur `⌘Q` dans Safari, ne fermez pas seulement la fenêtre).
2. Ouvrez **Finder → Applications** et faites glisser l'ancienne « **Gemini Voyager.app** » vers la Corbeille.
3. Ouvrez le DMG nouvellement téléchargé et faites glisser « **Voyager.app** » dans **Applications**.
4. Rouvrez Safari → **Réglages → Extensions** et activez « **Voyager Extension** ».

## Deux choses à ne pas faire

- ❌ **Ne gardez pas les deux applications.** Si vous laissez l'ancienne « Gemini Voyager.app » en place, les deux extensions entreront en conflit.
- ❌ **Ne cliquez pas sur « Désinstaller » pour l'ancienne extension dans le volet Extensions de Safari.** Cela renvoie vers l'ancienne application et complique les choses. Faites simplement glisser l'ancienne application vers la Corbeille, comme à l'étape 2.

## Ensuite

Une fois ce remplacement effectué, les futures versions Safari mettent à jour le nouveau « Voyager » via le système de mise à jour automatique intégré (Sparkle) — plus aucun remplacement manuel.

Une question ? Écrivez-nous sur [GitHub Issues](https://github.com/Nagi-ovo/voyager/issues).
