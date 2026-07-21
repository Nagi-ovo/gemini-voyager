# Guide de Contribution

> [!CAUTION]
> **Ce projet n'accepte actuellement PAS les PRs pour de nouvelles fonctionnalités.** Si vous souhaitez vraiment développer une fonctionnalité, veuillez suivre ce processus :
>
> 1. **Ouvrez d'abord un Issue** pour discuter de votre idée et de votre approche avec le mainteneur
> 2. **Attendez l'approbation et un plan d'implémentation solide** avant d'écrire du code ou de soumettre une PR
>
> Les PRs de nouvelles fonctionnalités soumises sans discussion préalable seront fermées sans examen. Merci de votre compréhension.

> [!IMPORTANT]
> **Statut du projet : Maintenance réduite.** Attendez-vous à des délais de réponse. Les PR avec tests sont prioritaires.

Merci d'envisager de contribuer à Voyager ! 🚀

Ce document fournit des directives et des instructions pour contribuer. Nous accueillons les corrections de bugs, les améliorations de la documentation et les traductions. Pour les nouvelles fonctionnalités, veuillez d'abord en discuter via un Issue.

## Politique des PR assistées par IA

**Les contributions assistées par IA sont les bienvenues, mais chaque PR doit être relue et vérifiée personnellement par la personne qui la soumet.**

Les outils d'IA peuvent être utiles, mais les contributions copiées-collées sans objectif clair, périmètre ciblé ni vérification réelle font perdre du temps aux mainteneurs.

- Vous êtes responsable de l'objectif, du périmètre, des changements de comportement et des résultats de vérification de votre PR. Vous n'avez pas besoin de comprendre entièrement chaque ligne générée par un agent, mais vous devez pouvoir expliquer ce que la PR résout et pourquoi l'approche est raisonnable.
- Avant de coder, clarifiez avec l'agent les exigences, le périmètre affecté, le comportement attendu et la méthode de vérification.
- Gardez la PR ciblée : une PR doit résoudre un seul problème ou apporter une modification cohérente, sans regrouper de changements sans rapport.
- La vérification est essentielle : testez vous-même le parcours réel après la modification. Pour les changements d'interface ou de comportement, essayez de l'utiliser pendant environ 15 minutes lorsque c'est possible.
- Soumettez la PR après vérification et joignez une preuve visuelle, par exemple des captures d'écran, des enregistrements ou une comparaison avant/après.

## Table des Matières

- [Commencer](#commencer)
- [Réclamer un Ticket](#réclamer-un-ticket)
- [Configuration de Développement](#configuration-de-développement)
- [Apporter des Modifications](#apporter-des-modifications)
- [Soumettre une Pull Request](#soumettre-une-pull-request)
- [Style de Code](#style-de-code)
- [Ajouter le Support d'un Gem](#ajouter-le-support-dun-gem)
- [Licence](#licence)

---

## Commencer

### Prérequis

- **Bun 1.3.12** (aligné sur `packageManager` et la CI)
- Chrome et Firefox pour les tests réels par défaut des changements d'exécution partagés
- Edge pour les changements touchant Chromium, les permissions, le manifeste ou l'empaquetage
- Safari/macOS pour les changements affectant Safari avant fusion

Consultez [Chargement et tests de fumée des navigateurs](BROWSER_TESTING.md) pour la matrice de risque et les procédures exactes. Si un environnement n'est pas disponible, indiquez `Needs <browser> test` et désignez une personne responsable ; une déduction de l'IA ne constitue pas une preuve de test.

`bun run build:edge` et `bun run verify:pr` nécessitent l'outil en ligne de commande `zip`. Sous Windows, utilisez WSL ou indiquez dans la PR les vérifications non exécutées et la personne chargée de les compléter.

### Démarrage Rapide

```bash
# Cloner le dépôt
git clone https://github.com/Nagi-ovo/voyager.git
cd voyager

# Installer les dépendances
bun install

# Démarrer le mode développement
bun run dev
```

---

## Réclamer un Ticket

Pour éviter le travail en double et coordonner les contributions :

### 1. Vérifier le Travail Existant

Avant de commencer, vérifiez si le ticket est déjà assigné à quelqu'un en regardant la section **Assignees**.

### 2. Réclamer un Ticket

Pour un ticket non assigné **sans** le label `community-only`, commentez `/claim` pour vous l'assigner automatiquement. Un bot confirmera l'assignation.

### 3. Tickets réservés à la communauté

Les tickets portant le label `community-only` sont réservés aux membres vérifiés de la communauté Voyager :

1. Le membre de la communauté commente `/claim`.
2. Un mainteneur vérifie son appartenance et commente `/approve @utilisateur`.
3. Ne commencez l'implémentation ou n'ouvrez une PR qu'après l'assignation par le bot.

Le label retire automatiquement `help wanted` et `good first issue`. Les autres contributeurs peuvent rejoindre le [Discord Voyager](https://discord.gg/TEUFxdMbGb) ou choisir un ticket sans `community-only`.

### 4. Libérer si Nécessaire

Si vous ne pouvez plus travailler sur un ticket, commentez `/unclaim` pour le libérer pour d'autres.

### 5. Case à Cocher de Contribution

Lors de la création de tickets, vous pouvez cocher la case "I am willing to contribute code" pour indiquer votre intérêt à implémenter la fonctionnalité ou le correctif.

---

## Configuration de Développement

### Installer les Dépendances

```bash
bun install
```

### Commandes Disponibles

| Commande                 | Description                                                                                   |
| ------------------------ | --------------------------------------------------------------------------------------------- |
| `bun run dev`            | Démarrer le mode dev Chrome avec rechargement à chaud                                         |
| `bun run dev:firefox`    | Démarrer le mode dev Firefox                                                                  |
| `bun run dev:safari`     | Démarrer le mode dev Safari (macOS uniquement)                                                |
| `bun run build`          | Build de production pour Chrome                                                               |
| `bun run build:edge`     | Build et paquet Edge indépendants                                                             |
| `bun run build:all`      | Builds Chrome + Firefox + Safari (Edge exclu)                                                 |
| `bun run build:browsers` | Builds Chrome + Edge + Firefox + Safari                                                       |
| `bun run lint`           | Exécuter ESLint avec correction automatique                                                   |
| `bun run typecheck`      | Exécuter la vérification de type TypeScript                                                   |
| `bun run test`           | Exécuter la suite de tests                                                                    |
| `bun run verify:pr`      | Validation automatisée locale standard (hors macOS natif et tests réels dans les navigateurs) |

### Charger l'Extension

Pour le développement courant dans Chrome, exécutez `bun run dev:chrome` et chargez `dist_chrome_dev` depuis `chrome://extensions/`. Consultez [Chargement et tests de fumée des navigateurs](BROWSER_TESTING.md) pour les artefacts exacts, les procédures de chargement et de rechargement, ainsi que les critères de validation pour Chrome, Edge, Firefox et Safari.

---

## Apporter des Modifications

### Avant de Commencer

1. **Créez une branche** depuis `main` :

   ```bash
   git checkout -b feature/nom-de-votre-fonctionnalite
   # ou
   git checkout -b fix/votre-correction-de-bug
   ```

2. **Lier les Issues** - Pour une nouvelle fonctionnalité, **ouvrez un Issue et attendez l'accord explicite du mainteneur sur l'approche**. Une commande `/claim` ou une assignation désigne seulement la personne responsable ; elle ne constitue pas une approbation de la fonctionnalité. Liez l'Issue depuis la PR.
3. **Utiliser systématiquement une PR** - Soumettez chaque modification du dépôt depuis une branche thématique vers une PR ciblant `main` ; ne poussez jamais de commits directement sur `main`.

### Liste de Contrôle Pré-Commit

Avant de soumettre, exécutez toujours :

```bash
bun run format     # Formater le code
bun run lint       # Appliquer les corrections de lint sûres
bun run verify:pr  # Validation locale standard ; hors macOS natif et tests réels dans les navigateurs
```

Assurez-vous que :

1. Vos modifications réalisent la fonctionnalité souhaitée.
2. Vos modifications n'affectent pas négativement les fonctionnalités existantes.
3. La PR indique les versions des navigateurs, les artefacts, les résultats et les preuves exigés par la [matrice de tests des navigateurs](BROWSER_TESTING.md).

---

## Stratégie de Test

Les tests doivent couvrir l'interface la plus susceptible de régresser, plutôt que d'être ignorés selon le type de fichier :

1. **Logique et état** : Les services principaux, le stockage, les analyseurs, les utilitaires et les états d'interface complexes nécessitent des tests automatisés.
2. **Scripts de contenu / DOM** : Lorsque les sélecteurs, le montage et le nettoyage, la navigation SPA ou les contrats DOM tiers changent, ajoutez un test de régression avec un fixture DOM minimal.
3. **Navigateurs réels** : Les tests automatisés ne remplacent ni le chargement de l'extension ni la vérification du parcours réel. Suivez la [matrice de tests des navigateurs](BROWSER_TESTING.md). Une modification purement visuelle peut expliquer pourquoi aucun nouveau test unitaire n'est utile.

---

## Soumettre une Pull Request

### Directives de PR

1. **Titre** : Utilisez un titre clair et descriptif (ex: "feat: add dark mode toggle" ou "fix: timeline scroll sync")
2. **Description** : Expliquez quels changements vous avez effectués et pourquoi
3. **Impact Utilisateur** : Décrivez comment les utilisateurs seront affectés
4. **Preuve Visuelle (Strict)** : Pour TOUT changement d'interface ou nouvelle fonctionnalité, vous **DEVEZ** fournir des captures d'écran ou des enregistrements. **Pas de capture = Pas de revue/réponse.**
5. **Référence de Ticket** : Liez les tickets associés (ex: "Closes #123")
6. **Tests et Logique** : Les changements de comportement doivent inclure des tests de régression automatisés pertinents. Si aucun test n'est utile, expliquez pourquoi et décrivez clairement la logique. Les corrections « magiques » sans contexte ne sont pas acceptées.
7. **Preuves par Navigateur** : Indiquez séparément l'état de Chrome, Edge, Firefox et Safari. Si un navigateur requis n'est pas disponible, notez `Needs <browser> test` et désignez une personne responsable ; ne présentez pas un build réussi comme une extension chargée ou testée dans le parcours réel.

### Format du Message de Commit

Suivez [Conventional Commits](https://www.conventionalcommits.org/) :

- `feat:` - Nouvelles fonctionnalités
- `fix:` - Corrections de bugs
- `docs:` - Changements de documentation
- `chore:` - Tâches de maintenance
- `refactor:` - Refactorisation de code
- `test:` - Ajout ou mise à jour de tests

---

## Style de Code

### Directives Générales

- **Préférez les retours anticipés** aux conditionnelles imbriquées
- **Utilisez des noms descriptifs** - évitez les abréviations
- **Évitez les nombres magiques** - utilisez des constantes nommées
- **Respectez le style existant** - la cohérence prime sur la préférence

### Conventions TypeScript

- **PascalCase** : Classes, interfaces, types, énumérations, composants React
- **camelCase** : Fonctions, variables, méthodes
- **UPPER_SNAKE_CASE** : Constantes

### Ordre d'Importation

1. React et imports liés
2. Bibliothèques tierces
3. Imports absolus internes (`@/...`)
4. Imports relatifs (`./...`)
5. Imports de type uniquement

```typescript
import React, { useState } from 'react';

import { marked } from 'marked';

import { Button } from '@/components/ui/Button';
import { StorageService } from '@/core/services/StorageService';
import type { FolderData } from '@/core/types/folder';

import { parseData } from './parser';
```

---

## Ajouter le Support d'un Gem

Pour ajouter le support d'un nouveau Gem (Gems officiels Google ou Gems personnalisés) :

1. Ouvrez `src/pages/content/folder/gemConfig.ts`
2. Ajoutez une nouvelle entrée au tableau `GEM_CONFIG` :

```typescript
{
  id: 'votre-id-gem',          // Depuis l'URL : /gem/votre-id-gem/...
  name: 'Nom de Votre Gem',    // Nom d'affichage
  icon: 'material_icon_name',  // Nom de l'icône Google Material Symbols
}
```

### Trouver l'ID du Gem

- Ouvrez une conversation avec le Gem
- Vérifiez l'URL : `https://gemini.google.com/app/gem/[GEM_ID]/...`
- Utilisez la partie `[GEM_ID]` dans votre configuration

### Choisir une Icône

Utilisez des noms d'icônes valides de [Google Material Symbols](https://fonts.google.com/icons) :

| Icône          | Cas d'Utilisation        |
| -------------- | ------------------------ |
| `auto_stories` | Apprentissage, Éducation |
| `lightbulb`    | Idées, Brainstorming     |
| `work`         | Carrière, Professionnel  |
| `code`         | Programmation, Technique |
| `analytics`    | Données, Analyse         |

---

## Portée du Projet

Voyager améliore l'expérience de chat Gemini AI avec :

- Navigation par chronologie
- Organisation par dossiers
- Coffre-fort de prompts
- Exportation de chat
- Personnalisation de l'interface utilisateur

> [!NOTE]
> **Nous considérons que l'ensemble des fonctionnalités de Voyager est déjà complet et suffisant.** Ajouter trop de fonctionnalités de niche ou trop personnalisées n'améliore pas le logiciel — cela ne fait qu'alourdir la charge de maintenance. À moins que vous ne considériez qu'une fonctionnalité est véritablement essentielle et bénéficierait à la majorité des utilisateurs, veuillez reconsidérer votre Feature Request.

**Hors de portée** : Scraping de site, interception réseau, automatisation de compte.

---

## Obtenir de l'Aide

- 💬 [GitHub Discussions](https://github.com/Nagi-ovo/voyager/discussions) - Poser des questions
- 🐛 [Issues](https://github.com/Nagi-ovo/voyager/issues) - Signaler des bugs
- 📖 [Documentation](https://voyager.nagi.fun/) - Lire la documentation

---

## Licence

En contribuant, vous acceptez que vos contributions soient licenciées sous la [Licence GPLv3](../LICENSE).
