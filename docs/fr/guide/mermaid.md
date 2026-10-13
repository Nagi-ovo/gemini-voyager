# Rendu des diagrammes Mermaid

Affichez automatiquement le code Mermaid sous forme de diagrammes visuels.

## Aperçu

Lorsque Gemini™ produit des blocs de code Mermaid (organigrammes, diagrammes de séquence, diagrammes de Gantt, etc.), Voyager les détecte et les affiche automatiquement sous forme de diagrammes interactifs.

### Fonctionnalités clés

- **Détection automatique** : prend en charge `graph`, `flowchart`, `sequenceDiagram`, `gantt`, `pie`, `classDiagram` et tous les grands types de diagrammes Mermaid.
- **Changement de vue** : passez du diagramme au code source en un clic.
- **Mode plein écran** : cliquez sur le diagramme pour passer en plein écran, avec zoom et déplacement.
- **Mode sombre** : s'adapte automatiquement au thème de la page.

## Activer ou désactiver

Le rendu Mermaid est activé par défaut sur Gemini. Pour le désactiver, ouvrez la fenêtre de Voyager et désactivez **Activer le rendu des diagrammes Mermaid** dans **Options générales**. Il n'est pas disponible sur AI Studio.

## Mode d'emploi

1. Demandez à Gemini de générer du code de diagramme Mermaid.
2. Le bloc de code est automatiquement remplacé par le diagramme rendu.
3. Cliquez sur le bouton **</> Code** pour afficher le code source.
4. Cliquez sur le bouton **📊 Diagramme** pour revenir à la vue diagramme.
5. Cliquez sur la zone du diagramme pour passer en plein écran.

## Commandes en plein écran

- **Molette de la souris** : zoom avant et arrière
- **Glisser** : déplacer le diagramme
- **+/-** : boutons de zoom de la barre d'outils
- **⊙** : réinitialiser la vue
- **✕ / Échap** : quitter le plein écran

## Compatibilité et dépannage

::: warning Remarque

- **Limitation de Firefox** : pour des raisons liées à l'environnement, Firefox embarque Mermaid 9.2.2, qui ne prend pas en charge les fonctionnalités récentes comme **Timeline** ou **Sankey**.
- **Erreurs de syntaxe** : les échecs de rendu viennent souvent d'erreurs de syntaxe dans la sortie de Gemini. Nous recueillons les « cas problématiques » afin de corriger automatiquement les erreurs de génération courantes dans les prochaines mises à jour.
  :::

<div align="center">
  <img src="/assets/mermaid-preview.png" alt="Rendu de diagramme Mermaid" style="max-width: 100%; border-radius: 8px;"/>
</div>
