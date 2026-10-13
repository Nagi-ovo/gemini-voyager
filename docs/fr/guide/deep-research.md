# Export Deep Research

Exportez le rapport final généré par Deep Research, ou enregistrez son processus de « réflexion » complet dans un fichier Markdown.

## 1. Export du rapport (PDF / image)

Les rapports générés par Deep Research peuvent être exportés en PDF soigneusement mis en forme ou en image unique à partager (les formats Markdown et JSON sont aussi pris en charge). Ouvrez le menu **Share & Export** du rapport et choisissez **Save Report**.

![Export du rapport](/assets/deep-research-report-export.png)

## 2. Export du processus de réflexion (Markdown)

En plus du rapport final, vous pouvez exporter tout le contenu de « réflexion » des conversations Deep Research.

### Fonctionnalités

- **Export en un clic** : une option de téléchargement apparaît dans le menu **Share & Export** du rapport.
- **Format structuré** : conserve les phases de réflexion, les éléments de réflexion et les sites consultés, dans leur ordre d'origine.
- **En-têtes lisibles** : les titres de section sont en anglais ; si Voyager est réglé sur une autre langue, chaque en-tête affiche cette langue à côté de l'anglais.
- **Nommage automatique** : les fichiers sont horodatés pour un classement facile (par exemple `deep-research-thinking-20240128-153045.md`).

### Mode d'emploi

1. Ouvrez une conversation Deep Research sur Gemini™.
2. Cliquez sur le bouton **Share & Export** du rapport.
3. Sélectionnez **Télécharger la réflexion** (Download thinking content).
4. Le fichier Markdown est téléchargé automatiquement.

![Export de la réflexion Deep Research](/assets/deepresearch_download_thinking.png)

### Format du fichier exporté

Le fichier Markdown exporté contient :

- **Titre** : le titre de la conversation.
- **Métadonnées** : l'horodatage de l'export et le nombre total de phases de réflexion.
- **Phases de réflexion** : chaque phase contient :
  - les éléments de réflexion (avec leurs en-têtes et leur contenu) ;
  - les sites consultés (avec leurs liens et leurs titres).

#### Exemple de structure

```markdown
# Deep Research Conversation Title

**Exported At:** 2025-12-28 17:25:35
**Total Phases:** 3

---

## Thinking Phase 1

### Thought Title 1

Thought content...

### Thought Title 2

Thought content...

#### Researched Websites

- [domain.com](https://example.com) - Page Title
- [another.com](https://another.com) - Another Title

---

## Thinking Phase 2

...
```

## Confidentialité

Toute l'extraction et la mise en forme se font à 100 % localement, dans votre navigateur. Aucune donnée n'est envoyée à des serveurs externes.
