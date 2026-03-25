# Rendu LaTeX des messages utilisateur

::: info
**Note**: Cette fonctionnalité est supportée dans la version 1.3.7 et ultérieure.
:::

Rendu automatique des formules LaTeX dans les messages utilisateur en notation mathématique.

## Présentation

Lorsque vous utilisez la syntaxe LaTeX dans le chat Gemini™ (par ex. `$E=mc^2$` ou `$$\int_0^1 x^2 dx$$`), Voyager détecte et affiche automatiquement de belles formules mathématiques.

### Fonctionnalités principales

- **Formule en ligne** : entourée de `$...$` (ex. `$x^2 + y^2 = r^2$`)
- **Formule en bloc** : entourée de `$$...$$`, affichée centrée sur sa propre ligne
- **Détection automatique** : traite les messages existants et nouvellement envoyés
- **Moteur KaTeX** : rendu mathématique de haute qualité via KaTeX

## Comment utiliser

1. Tapez un message contenant de la syntaxe LaTeX dans le chat Gemini
2. Après l'envoi, les formules sont automatiquement rendues en notation mathématique
3. Les formules en ligne `$...$` s'affichent dans le texte
4. Les formules en bloc `$$...$$` s'affichent centrées sur une ligne séparée

## Exemples de syntaxe

| Entrée                                    | Description      |
| ----------------------------------------- | ---------------- |
| `$E=mc^2$`                                | Formule en ligne |
| `$$\sum_{i=1}^{n} i = \frac{n(n+1)}{2}$$` | Formule en bloc  |
| `$\alpha, \beta, \gamma$`                 | Lettres grecques |
| `$\sqrt{x^2 + y^2}$`                      | Racine carrée    |

## Remarques

::: tip

- S'applique uniquement aux messages envoyés par l'utilisateur. Les formules des réponses de Gemini sont rendues par Gemini.
- Si la syntaxe LaTeX est invalide, le texte original sera affiché.
  :::

<div align="center">
  <img src="/assets/input-latex.png" alt="Rendu LaTeX des messages utilisateur" style="max-width: 100%; border-radius: 8px;"/>
</div>
