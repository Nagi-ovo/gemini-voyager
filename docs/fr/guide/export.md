# Liberté totale

Le verrouillage des données est l'ennemi.
Nous croyons que si vous le créez, vous le possédez.

Voyager Export vous permet de télécharger n'importe quelle conversation Gemini ou ChatGPT au format Markdown, PDF, JSON ou image. Il extrait l'intégralité du contenu, y compris les blocs de code, les images et la mise en forme, et vous offre une copie permanente et portable de chaque conversation IA.

## Comparaison des formats

| Critère           | Markdown                                 | PDF                      | JSON                             | Image               |
| ----------------- | ---------------------------------------- | ------------------------ | -------------------------------- | ------------------- |
| Idéal pour        | Applications de notes (Obsidian, Notion) | Partage et impression    | Développeurs, analyse de données | Partage sur mobile  |
| Images            | Intégrées                                | Entièrement incluses     | Encodées en base64               | Rendues sur place   |
| Blocs de code     | Conservés avec la coloration syntaxique  | Rendus visuellement      | Texte brut conservé              | Rendus visuellement |
| Taille du fichier | La plus petite                           | La plus grande           | Moyenne                          | Grande              |
| Recherchable      | Texte brut                               | Recherche du lecteur PDF | Accès programmatique             | Non                 |

## Exportez tout

Voyager vous permet de sortir vos données du cloud pour les avoir entre les mains.

### Les formats

- **Markdown** : pour votre coffre Obsidian ou Notion. Texte propre et mis en forme, avec images intégrées.
- **PDF** : pour partager ou imprimer. Mise en page soignée, images incluses.
- **JSON** : données brutes. Pour les développeurs qui veulent construire à partir de leur historique.
- **Image** : un long PNG, parfait pour le partage sur téléphone. Choisissez une mise en page étroite, moyenne ou large.

### Comment exporter

1. Cliquez sur le bouton **Exporter** en haut à droite de la page (mises en page actuelles de ChatGPT et de Gemini). Sur Gemini, vous pouvez aussi choisir **Exporter l'historique de la conversation** dans le menu ⋮ d'une conversation ou d'une réponse ; sur les anciennes mises en page de Gemini, survolez le logo Gemini pour afficher l'**icône d'export**.
2. Choisissez votre format.
3. C'est fait.

Ce sont vos données. Faites-en ce que vous voulez.

<div style="display: flex; gap: 20px; margin-top: 20px;">
  <div style="flex: 1; text-align: center;">
    <p><b>Étape 1 : trouver Exporter</b></p>
    <img src="/assets/gemini-export-guide-1.png" alt="Guide export étape 1" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);"/>
  </div>
  <div style="flex: 1; text-align: center;">
    <p><b>Étape 2 : le choix</b></p>
    <img src="/assets/gemini-export-guide-2.png" alt="Guide export étape 2" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);"/>
  </div>
</div>

### Remarque sur l'export PDF dans Safari

L'export PDF dans Safari suit une procédure légèrement différente (impression manuelle) :

1. Cliquez sur le bouton **Exporter** et sélectionnez le format PDF.
2. **Attendez environ une seconde** (le temps que la page prépare les styles d'impression).
3. Appuyez sur `Command + P` pour ouvrir la boîte de dialogue d'impression.
4. Sélectionnez **« Enregistrer au format PDF »** (Save to PDF) dans la boîte de dialogue d'impression.

<img src="/assets/safari-export-pdf.png" alt="Export PDF Safari" style="max-width: 100%; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); margin-top: 20px;"/>

## Export des rapports Deep Research

Le mode Deep Research de Gemini produit des rapports structurés, avec sources, étapes de réflexion et citations. Voyager peut exporter ces sessions avec toutes leurs métadonnées :

1. Ouvrez une conversation Deep Research terminée.
2. Ouvrez le menu **Share & Export** du rapport et choisissez **Save Report**.
3. Choisissez votre format.
4. L'export contient le rapport final avec ses liens vers les sources. Pour enregistrer aussi le processus de réflexion, voir [Export Deep Research](/fr/guide/deep-research).

C'est utile pour la recherche académique, l'analyse concurrentielle et la documentation technique, lorsqu'il faut conserver la chaîne de raisonnement et l'attribution des sources.

## Quand exporter

- **Archivage des connaissances** : sauvegardez les conversations importantes avant qu'elles ne disparaissent dans votre historique.
- **Partage en équipe** : exportez une session de débogage en PDF pour la partager avec des collègues qui n'utilisent pas Gemini.
- **Constitution d'une base de connaissances** : exportez les conversations en Markdown et classez-les dans Obsidian ou Notion.
- **Analyse de données** : utilisez les exports JSON pour analyser par programme les schémas de conversation ou extraire des données structurées.
- **Conformité et audit** : conservez la trace des décisions prises avec l'aide de l'IA.

## Plateformes prises en charge

L'export fonctionne sur Gemini et ChatGPT, sur Chrome, Edge, Firefox, Safari, Opera et Brave. Sur Safari, l'export PDF passe par une étape d'impression manuelle (Commande+P après avoir cliqué sur Exporter) ; les exports Markdown et JSON incluent toujours les images.
