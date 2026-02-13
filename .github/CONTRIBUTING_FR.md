# Guide de Contribution

> [!IMPORTANT]
> **Statut du projet : Maintenance réduite.** Attendez-vous à des délais de réponse. Les PR avec tests sont prioritaires.

Merci d'envisager de contribuer à Gemini Voyager ! 🚀

Ce document fournit des directives et des instructions pour contribuer. Nous accueillons toutes les contributions, qu'il s'agisse de corrections de bugs, de nouvelles fonctionnalités, d'améliorations de la documentation ou de traductions.

## 🚫 Politique IA

**Nous rejetons explicitement les PR générées par l'IA qui n'ont pas été vérifiées manuellement.**

Bien que les outils d'IA soient d'excellents assistants, les contributions "paresseuses" de copier-coller font perdre du temps aux mainteneurs.

- **Les PR d'IA de mauvaise qualité** seront fermées immédiatement sans discussion.
- **Les PR sans explication** de la logique ou manquant de tests nécessaires seront rejetées.
- Vous devez comprendre et assumer la responsabilité de chaque ligne de code que vous soumettez.

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

- **Bun** 1.0+ (Requis)
- Un navigateur basé sur Chromium pour les tests (Chrome, Edge, Brave, etc.)

### Démarrage Rapide

```bash
# Cloner le dépôt
git clone https://github.com/Nagi-ovo/gemini-voyager.git
cd gemini-voyager

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

Commentez `/claim` sur n'importe quel ticket non assigné pour vous l'assigner automatiquement. Un bot confirmera l'assignation.

### 3. Libérer si Nécessaire

Si vous ne pouvez plus travailler sur un ticket, commentez `/unclaim` pour le libérer pour d'autres.

### 4. Case à Cocher de Contribution

Lors de la création de tickets, vous pouvez cocher la case "I am willing to contribute code" pour indiquer votre intérêt à implémenter la fonctionnalité ou le correctif.

---

## Configuration de Développement

### Installer les Dépendances

```bash
bun install
```

### Commandes Disponibles

| Commande              | Description                                           |
| --------------------- | ----------------------------------------------------- |
| `bun run dev`         | Démarrer le mode dev Chrome avec rechargement à chaud |
| `bun run dev:firefox` | Démarrer le mode dev Firefox                          |
| `bun run dev:safari`  | Démarrer le mode dev Safari (macOS uniquement)        |
| `bun run build`       | Build de production pour Chrome                       |
| `bun run build:all`   | Build de production pour tous les navigateurs         |
| `bun run lint`        | Exécuter ESLint avec correction automatique           |
| `bun run typecheck`   | Exécuter la vérification de type TypeScript           |
| `bun run test`        | Exécuter la suite de tests                            |

### Charger l'Extension

1. Exécutez `bun run dev` pour démarrer le build de développement
2. Ouvrez Chrome et allez sur `chrome://extensions/`
3. Activez le "Mode développeur"
4. Cliquez sur "Charger l'extension non empaquetée" et sélectionnez le dossier `dist_chrome`

---

## Apporter des Modifications

### Avant de Commencer

1. **Créez une branche** depuis `main` :

   ```bash
   git checkout -b feature/nom-de-votre-fonctionnalite
   # ou
   git checkout -b fix/votre-correction-de-bug
   ```

2. **Lier les Issues** - Lors de l'implémentation d'une nouvelle fonctionnalité, vous devez **d'abord ouvrir un Issue pour discussion**. Les PR pour de nouvelles fonctionnalités soumises sans discussion préalable seront fermées. Lors de la soumission d'une PR, veuillez lier cet Issue.

3. **Gardez les modifications ciblées** - une fonctionnalité ou correction par PR

### Liste de Contrôle Pré-Commit

Avant de soumettre, exécutez toujours :

```bash
bun run lint       # Corriger les problèmes de linting
bun run format     # Formater le code
bun run typecheck  # Vérifier les types
bun run build      # Vérifier que le build réussit
bun run test       # Exécuter les tests
```

Assurez-vous que :

1. Vos modifications réalisent la fonctionnalité souhaitée.
2. Vos modifications n'affectent pas négativement les fonctionnalités existantes.

---

## Stratégie de Test

Nous suivons une stratégie de test basée sur le ROI : **Testez la logique, pas le DOM.**

1. **Indispensable (Logique)** : Services principaux (Stockage, Sauvegarde), analyseurs de données et utilitaires. Le TDD est requis ici.
2. **Recommandé (État)** : État d'interface utilisateur complexe (ex: Reducer de dossiers).
3. **Ignorer (Fragile)** : Manipulation directe du DOM (Scripts de contenu) et composants d'interface utilisateur purs. Utilisez plutôt la programmation défensive.

---

## Soumettre une Pull Request

### Directives de PR

1. **Titre** : Utilisez un titre clair et descriptif (ex: "feat: add dark mode toggle" ou "fix: timeline scroll sync")
2. **Description** : Expliquez quels changements vous avez effectués et pourquoi
3. **Impact Utilisateur** : Décrivez comment les utilisateurs seront affectés
4. **Preuve Visuelle (Strict)** : Pour TOUT changement d'interface ou nouvelle fonctionnalité, vous **DEVEZ** fournir des captures d'écran ou des enregistrements. **Pas de capture = Pas de revue/réponse.**
5. **Référence de Ticket** : Liez les tickets associés (ex: "Closes #123")

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

Gemini Voyager améliore l'expérience de chat Gemini AI avec :

- Navigation par chronologie
- Organisation par dossiers
- Coffre-fort de prompts
- Exportation de chat
- Personnalisation de l'interface utilisateur

**Hors de portée** : Scraping de site, interception réseau, automatisation de compte.

---

## Obtenir de l'Aide

- 💬 [GitHub Discussions](https://github.com/Nagi-ovo/gemini-voyager/discussions) - Poser des questions
- 🐛 [Issues](https://github.com/Nagi-ovo/gemini-voyager/issues) - Signaler des bugs
- 📖 [Documentation](https://gemini-voyager.vercel.app/) - Lire la documentation

---

## Licence

En contribuant, vous acceptez que vos contributions soient licenciées sous la [Licence GPLv3](../LICENSE).
