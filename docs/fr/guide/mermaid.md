# Rendu de Diagrammes Mermaid

Rendez automatiquement le code Mermaid sous forme de diagrammes visuels.

## Aperçu

Lorsque Gemini™ produit des blocs de code Mermaid (organigrammes, diagrammes de séquence, diagrammes de Gantt, etc.), Voyager les détecte et les rend automatiquement sous forme de diagrammes interactifs.

### Fonctionnalités Clés

- **Auto-détection** : Supporte `graph`, `flowchart`, `sequenceDiagram`, `gantt`, `pie`, `classDiagram`, et tous les types majeurs de diagrammes Mermaid.
- **Basculer la vue** : Passez du diagramme rendu au code source en un clic.
- **Mode plein écran** : Cliquez sur le diagramme pour entrer en plein écran avec support du zoom et du panoramique.
- **Mode sombre** : S'adapte automatiquement au thème de la page.

## Comment Utiliser

1. Demandez à Gemini de générer n'importe quel code de diagramme Mermaid.
2. Le bloc de code est automatiquement remplacé par le diagramme rendu.
3. Cliquez sur le bouton **</> Code** pour voir le code source.
4. Cliquez sur le bouton **📊 Diagramme** pour revenir à la vue diagramme.
5. Cliquez sur la zone du diagramme pour passer en plein écran.

## Contrôles Plein Écran

- **Molette souris** : Zoom avant/arrière
- **Glisser** : Panoramique du diagramme
- **+/-** : Boutons de zoom de la barre d'outils
- **⊙** : Réinitialiser la vue
- **✕ / ESC** : Fermer le plein écran

## Compatibilité et Dépannage

::: warning Note

- **Limitation Firefox** : En raison de restrictions environnementales, Firefox utilise la version 9.2.2 et ne prend pas en charge les nouvelles fonctionnalités comme **Timeline** ou **Sankey**.
- **Erreurs de syntaxe** : Les échecs de rendu sont souvent dus à des erreurs de syntaxe dans la sortie de Gemini. Nous collectons les "bad cases" pour implémenter des correctifs automatiques dans les futures mises à jour.
  :::

<div align="center">
  <img src="/assets/mermaid-preview.png" alt="Rendu diagramme Mermaid" style="max-width: 100%; border-radius: 8px;"/>
</div>
