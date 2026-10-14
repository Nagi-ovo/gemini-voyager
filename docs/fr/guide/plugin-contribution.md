# Guide de contribution aux plugins

Le système de plugins de Voyager repose sur des plugins déclaratifs : vous décrivez les métadonnées du plugin et ses opérations DOM dans `plugin.json`, puis les changements visuels en CSS. Les plugins n'exécutent pas de JavaScript distant ; le moteur de plugins intégré à Voyager interprète le manifeste et les styles.

Cette approche rend les plugins plus faciles à relire et à maintenir. Si vous voulez contribuer un plugin, commencez par ici.

## Pour vous seul : les plugins locaux

Un plugin dont vous n'avez besoin que dans votre propre navigateur ne passe pas par ce processus. Créez-le comme plugin local et importez-le dans la fenêtre de l'extension : pas d'Issue, pas de PR, pas de copie du dépôt. [Écrire votre propre plugin](./write-a-plugin.md) présente les trois façons d'en créer un, dont le vérificateur `create-voyager-plugin` et la skill destinée aux agents de code.

## Parcours recommandé

1. Vérifiez d'abord que l'idée convient à un plugin : largeur de lecture, corrections de mise en page, ajustements de thème, masquage ou marquage d'éléments de page, et adaptations simples de sites sont généralement de bons candidats.
2. Ouvrez d'abord une Issue dans le dépôt Voyager. Expliquez le problème, le site cible et ce qui le distingue des plugins existants ; attendez l'accord explicite d'un mainteneur avant de coder ou d'ouvrir une PR.
3. Utilisez `plugin.json` pour les métadonnées, les correspondances de sites, les réglages et les contributions.
4. Placez les styles dans `style.css`, dans le même dossier, puis référencez-le depuis `contributes.styles`.
5. Testez en local et joignez à la PR des pages de test, des captures d'écran ou un court enregistrement. Les mainteneurs décideront si le plugin est prêt pour le catalogue officiel.

## Arborescence

Les plugins officiels fournis avec l'extension se trouvent sous `src/features/plugins/catalog/`, avec un dossier par plateforme :

```
src/features/plugins/catalog/
  marketplace.json                        index lu par le magasin de plugins de la documentation
  sites/<site>/site.json                  l'adaptateur de site, sous forme de données
  sites/<site>/plugins/<id>/plugin.json   un plugin déclaratif
  sites/<site>/plugins/<id>/style.css     ses styles
  sites/<site>/plugins/<id>/README.md     ce qu'il corrige et pourquoi
```

La découverte est automatique : `catalog/sites/index.ts` trouve chaque `site.json` et chaque `plugin.json` grâce à `import.meta.glob`. Ajouter un site ou un plugin revient donc à ajouter des fichiers ; il n'y a aucune table de correspondance à modifier.

`marketplace.json` n'est pas cette table. C'est seulement l'index que lit le magasin de plugins de la documentation, et un test le garde synchronisé avec la découverte : un nouveau plugin doit donc aussi y figurer. Son `source` est le chemin relatif au catalogue, par exemple `sites/deepseek/plugins/reading-width/plugin.json`. Les plugins situés sous `sites/gemini/` et `sites/aistudio/` font exception : ils sont livrés dans Voyager et ne figurent pas dans `marketplace.json`.

Les `matches` d'un plugin doivent rester dans les `matches` du site où il se trouve. Un plugin qui déborde de son site fait échouer le build.

## Clés sémantiques de sélecteurs

`site.json` associe un vocabulaire fixe de clés sémantiques à des sélecteurs CSS propres à chaque site. Ce vocabulaire est défini dans `src/features/plugins/sites/semanticKeys.ts` : un `site.json` ne peut utiliser que les clés de cette liste, et une clé inconnue est rejetée.

- `userTurn` : le conteneur d'un message utilisateur.
- `assistantTurn` : le conteneur d'un message de l'assistant.
- `thinkingBlock` : la section de raisonnement d'une réponse de l'assistant.
- `codeBlock` : un bloc de code rendu.
- `composer` : le champ de saisie dans lequel l'utilisateur tape son prompt.
- `sidebar` : la liste des conversations ou le rail de navigation.
- `sidePanel` : un panneau secondaire, par exemple les artifacts ou le canevas.
- `headerActions` : le groupe d'actions en haut à droite de la vue de conversation.
- `scrollContainer` : l'élément qui fait défiler la conversation.
- `composerRoot` : le conteneur qui regroupe le champ de saisie et ses boutons d'action.
- `sendButton` : le bouton qui envoie le prompt ; certains sites ne l'affichent qu'une fois le prompt non vide.

Un site ne déclare que les clés qu'il peut réellement fournir. Un plugin référence une clé plutôt qu'un sélecteur brut, en écrivant `{ "kind": "semantic", "key": "userTurn" }` comme `target` d'une opération DOM : ainsi, une refonte du site se corrige dans un seul fichier, `site.json`.

`conversationIdPattern` est un champ distinct de `site.json`, et non un sélecteur : c'est une expression régulière appliquée au chemin de l'URL, dont le premier groupe capturant est l'identifiant de la conversation, par exemple `^/chat/([^/?#]+)`.

## Ajouter une nouvelle plateforme

Ajouter un nouveau site de discussion repose sur deux couches distinctes :

1. L'**adaptateur de site**, `catalog/sites/<site>/site.json`, apprend à Voyager à reconnaître le site et à trouver ses messages utilisateur, ses réponses de l'assistant, son champ de saisie, sa barre latérale et ses marqueurs de thème.
2. Un **plugin** sous `catalog/sites/<site>/plugins/<id>/` résout un problème précis pour l'utilisateur sur ce site, comme la largeur de lecture ou une correction de rendu.

Un `site.json` contient `id` (identique au nom de son dossier), `label`, `matches`, `selectors`, `theme`, `brandColor`, `capabilities`, ainsi que les champs facultatifs `conversationIdPattern` et `turnKeyAttributes`. `turnKeyAttributes` désigne les attributs qui conservent l'identité d'un message utilisateur lorsque la page le re-rend ; le suivi des envois (utilisé par la vue Activité des dossiers et par les horodatages de la chronologie) ne s'exécute que sur un site qui le définit, avec `composer`, `userTurn` et un `conversationIdPattern`. `validateSiteAdapterData`, dans `src/features/plugins/sites/siteAdapterData.ts`, le valide, et `bun run catalog:build` valide tous les sites et plugins avant publication.

Chaque plateforme de plugins est une donnée. Les sites actuels sont ChatGPT, Claude et DeepSeek. Gemini et AI Studio sont des surfaces natives de Voyager avec leur propre `site.json` (`catalog/sites/gemini/` et `catalog/sites/aistudio/`), mais ce fichier est livré dans le paquet et n'est jamais publié dans le catalogue distant. Les cinq adaptateurs, `adapters/gemini.ts`, `aistudio.ts`, `claude.ts`, `chatgpt.ts` et `deepseek.ts`, ne sont que des coquilles d'une ligne au-dessus de leur `site.json` : modifiez le JSON, pas le TypeScript.

Le catalogue publié par hôte transporte aussi les données du site. Une correction de sélecteur dans `site.json` peut donc atteindre les utilisateurs sans nouvelle version de l'extension. Un site tout nouveau a toutefois toujours besoin de son fichier, car il requiert aussi une permission d'hôte et l'enregistrement du script de contenu, qui sont livrés dans le paquet.

Pour une nouvelle plateforme comme DeepSeek, concentrez le travail sur le contrat de la plateforme. Regroupez dans un même changement complet le `site.json`, les tests de sélecteurs requis et la documentation minimale qui explique le support. Le registre des sites récupère le nouvel adaptateur à partir du fichier lui-même : aucune liste d'enregistrement à modifier. N'ajoutez pas un nouveau site pour chaque plugin.

Une fois l'adaptateur accepté, les plugins suivants peuvent être proposés comme changements distincts et ciblés. Si plusieurs changements dépendent les uns des autres, une chaîne de PR empilées est utile : chaque branche suivante repose sur la précédente, et chaque PR n'affiche que sa propre fonctionnalité incrémentale. La chaîne doit suivre la même règle de périmètre : un objectif utilisateur clair par PR, avec ses tests requis et son nettoyage.

Le support d'un site ne nécessite aucune intégration d'API de modèle. N'ajoutez pas de script de contenu statique ni de permission d'hôte obligatoire pour une nouvelle plateforme ; utilisez le flux existant des permissions facultatives et de l'enregistrement dynamique pour les sites qui ne servent qu'à des plugins.

Ce flux dépend de la version du navigateur. Chrome et Edge prennent en charge le flux utilisé par l'extension. Firefox exige la version 128 ou une version ultérieure pour les permissions d'hôte facultatives, et Safari exige la version 16.4 ou une version ultérieure pour l'enregistrement dynamique des scripts de contenu. Sur les anciennes versions prises en charge, la fenêtre peut refuser à juste titre d'activer un plugin pour un site personnalisé, car les API requises ne peuvent pas fournir une autorisation persistante. Ne contournez pas cette limite en ajoutant une permission d'hôte statique large sans l'accord d'un mainteneur.

## Périmètre d'un plugin

Un plugin doit être défini par le problème utilisateur qu'il résout, et non découpé mécaniquement par plateforme.

Un plugin du catalogue vit dans le dossier d'un seul site, et chacun de ses `matches` doit être couvert par le `site.json` de ce dossier (sinon `bun run plugin:check` échoue). Un même plugin ne peut donc pas couvrir à la fois Claude et ChatGPT. Lorsqu'une même fonctionnalité convient à plusieurs plateformes, comme la largeur de lecture, la navigation dans la page ou la mise en page des blocs de code, publiez un plugin par dossier de site (par exemple `sites/claude/plugins/reading-width` et `sites/chatgpt/plugins/reading-width`), et gardez leurs noms, réglages et descriptions cohérents.

Si chaque plateforme exige des réglages, une logique DOM ou des textes très différents, des plugins séparés seront plus clairs. Ne forcez pas des comportements sans rapport dans un seul plugin pour qu'il « couvre tout » : un plugin doit résoudre un problème clair.

Règle rapide :

- Même objectif utilisateur, mêmes réglages, seuls les sélecteurs changent : un plugin par dossier de site, avec des noms et des réglages cohérents.
- Même thème, mais comportement très différent selon la plateforme : séparez-les, en gardant des noms et des descriptions liés.
- Objectifs différents : ne fusionnez pas.

## Éviter les doublons

Avant de proposer un plugin, vérifiez le Marketplace et les plugins officiels existants. Si un bon plugin existe déjà, améliorez-le plutôt que d'en créer un semblable.

Un doublon ne vaut la peine d'être accepté que s'il apporte une amélioration claire, par exemple :

- il prend en charge une plateforme importante que le plugin d'origine ne couvre pas ;
- il corrige un problème de compatibilité que le plugin d'origine ne peut pas résoudre ;
- il est nettement meilleur en performance, en accessibilité ou en maintenabilité ;
- il offre une expérience utilisateur réellement différente, et pas seulement une copie renommée ou légèrement restylée.

Cela garde le Marketplace lisible et aide les utilisateurs à choisir.

## Exemple minimal

Partez du modèle plutôt que d'un répertoire vide : `bun run plugin:new <id-segment> --site <site>` crée `catalog/sites/<site>/plugins/<id-segment>/` avec un `plugin.json`, un `style.css` et un `README.md`, et ajoute l'entrée correspondante à `marketplace.json`. Ce qu'il génère est un point de départ, pas une approbation ; le manifeste que vous complétez a cette forme :

```json
{
  "$schema": "https://voyager.nagi.fun/plugin.schema.json",
  "id": "your-name.example-plugin",
  "name": "Example Plugin",
  "version": "1.0.0",
  "description": "A short description of what this plugin improves.",
  "author": "your-name",
  "category": "readability",
  "license": "MIT",
  "engine": ">=1.0.0",
  "tier": "declarative",
  "matches": ["https://claude.ai/*"],
  "contributes": {
    "styles": [{ "file": "style.css" }],
    "domOps": [
      {
        "op": "addClass",
        "target": "body",
        "className": "gv-plugin-example"
      }
    ]
  }
}
```

La ligne `$schema` est facultative et ne sert qu'à votre éditeur : elle pointe vers le JSON Schema du manifeste, qui valide le fichier et le complète pendant la saisie. `site.json` a le sien à l'adresse `https://voyager.nagi.fun/site.schema.json`.

`style.css` peut utiliser du CSS classique, mais les styles d'un plugin doivent rester sous votre propre classe `gv-plugin-*` :

```css
.gv-plugin-example .some-target {
  max-width: 880px;
}
```

## Notes sur le manifeste

- Utilisez un préfixe d'auteur ou une notation en domaine inversé pour `id`, par exemple `your-name.reading-width`, afin d'éviter les collisions.
- Gardez `matches` restreint. Ne ciblez que les sites où le plugin doit réellement fonctionner.
- Un plugin ne peut lister plusieurs hôtes dans `matches` que si le `site.json` de son site les couvre tous (par exemple chatgpt.com et chat.openai.com). Pour couvrir un autre site, ajoutez un plugin dans le dossier de ce site.
- Valeurs recommandées pour `category` : `render-fix`, `theme`, `layout`, `readability`, `productivity`, `integration` ou `other`.
- Indiquez dans `engine` la version du moteur de plugins dont vous avez besoin. Les plugins officiels peuvent servir d'exemples.
- Ajoutez `i18n` pour le chinois, l'anglais et les autres langues courantes lorsque c'est possible.

## Limites CSS et ressources

Les plugins déclaratifs sont validés comme des entrées non fiables. Gardez donc les ressources autonomes :

- N'utilisez pas `@import`.
- Ne référencez ni images distantes, ni polices externes, ni CSS distant.
- Vous pouvez utiliser du CSS classique, des propriétés personnalisées et les substitutions de valeurs de réglages de Voyager.
- Préfixez les classes de plugin avec `gv-plugin-` pour éviter que les styles ne fuient vers le site hôte ou vers Voyager lui-même.

Si votre plugin a besoin de réglages, privilégiez des réglages numériques lorsque c'est possible. Par exemple, un plugin de largeur de lecture peut écrire la valeur du réglage dans une variable CSS, que le CSS consomme ensuite.

## Limites des opérations DOM

Les plugins déclaratifs prennent actuellement en charge :

- `addClass` : ajoute une classe aux éléments ciblés.
- `setAttribute` : définit un attribut.
- `setStyle` : définit des styles inline ou des variables CSS. Terminez une valeur par `!important` pour l'appliquer avec cette priorité ; les anciennes versions de Voyager ignorent une telle valeur, donc réglez `engine` sur `>=1.9.0` si votre plugin en dépend. Les raccourcis comme `margin` sont suivis longhand par longhand : désactiver un plugin n'efface jamais le `margin-top` d'un autre plugin.
- `hide` : masque les éléments ciblés.

La cible peut être un sélecteur CSS ou l'une des clés sémantiques listées plus haut, écrite `{ "kind": "semantic", "key": "userTurn" }`. Les clés sémantiques sont généralement plus stables, mais elles exigent que l'adaptateur du site actuel déclare la clé.

Les opérations déclaratives doivent être réversibles et sûres à exécuter plusieurs fois. Ne vous fiez pas à un état ponctuel de la page, et ne supposez pas que le DOM ne change jamais.

### Primitives

Certains comportements ne peuvent pas être décrits avec du CSS et une modification réversible du DOM. Une primitive est du code de première partie livré dans Voyager, qu'un manifeste peut appeler par son nom grâce à l'opération `native` :

```json
{
  "engine": ">=1.3.0",
  "requires": { "handlers": ["formulaCopy"] },
  "contributes": {
    "domOps": [{ "op": "native", "handler": "formulaCopy", "params": {} }]
  }
}
```

Le manifeste choisit une primitive et la configure. Il ne fournit jamais de logique, et `params` est validé par la primitive elle-même avant son exécution.

Deux règles s'appliquent à tout plugin qui en utilise une :

- Chaque site visé par le plugin doit déclarer les clés sémantiques que la primitive lit (`mermaid`, par exemple, lit `assistantTurn` et `codeBlock`). `requires.handlers` est facultatif : l'opération `native` implique déjà sa primitive.
- `engine` doit être au moins égal à la version du moteur qui a livré la primitive en premier. `formulaCopy` est arrivée dans le moteur 1.3.0 ; un plugin qui l'utilise déclare donc `">=1.3.0"`. Une plage inférieure fait échouer `bun run catalog:build`, car une ancienne version de Voyager signalerait alors un handler manquant au lieu de demander une mise à jour.

Les primitives ne font que s'enrichir : un nouveau paramètre est toujours facultatif, et tout changement incompatible est livré sous un nouveau nom.

Un plugin dont le comportement change peut aussi porter un `changelog` d'une seule ligne, que la fenêtre affiche à côté de la version. Traduisez-le dans `i18n.<locale>.changelog`, à côté de `name` et `description`.

## Quand ne pas utiliser un plugin classique

Si une fonctionnalité doit exécuter du JavaScript, intercepter des requêtes réseau, lire ou écrire les données internes de Voyager, ou dépendre d'une logique d'exécution complexe, elle ne convient pas à un plugin déclaratif classique.

Ouvrez d'abord une Issue et décrivez le besoin. Si la fonctionnalité nécessite vraiment une capacité intégrée, nous pourrons envisager de l'implémenter dans le dépôt Voyager sous forme de plugin builtin/native, comme Formula Copy.

## Avant d'ouvrir une PR

Lancez `bun run plugin:check <dossier du plugin>` et collez sa sortie dans la PR. Il signale tous les problèmes d'un coup, du manifeste et du CSS jusqu'à l'inclusion dans le site, en passant par les primitives, les clés sémantiques, les dix langues et le README. La CI exécute la même vérification sur tous les plugins fournis.

- Le plugin est désactivé par défaut, et l'utilisateur l'active lui-même.
- Vous avez vérifié qu'aucun plugin presque identique n'existe ; si c'est le cas, améliorez d'abord le plugin existant.
- Vous avez testé le site cible en thème clair et en thème sombre.
- `matches` ne couvre aucun site sans rapport.
- Aucune ressource distante n'est référencée.
- Le dossier du plugin contient `plugin.json`, les fichiers CSS nécessaires et un court README.
- Pour un plugin officiel, le dossier se trouve sous `catalog/sites/<site>/plugins/<id>/`, ses `matches` restent dans ceux du site, et `catalog/marketplace.json` le référence (sauf les plugins Gemini et AI Studio, livrés avec Voyager).
- La PR décrit les pages de test, les captures ou enregistrements, et les zones de page concernées.

Restez simple, ciblé et réversible. Un plugin qui résout un problème clair est beaucoup plus facile à fusionner et à maintenir.
