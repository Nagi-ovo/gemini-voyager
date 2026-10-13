# Transfert de mémoire : synchronisation du contexte (expérimental)

**Des dimensions différentes, un partage fluide**

Élaborez la logique sur le web, et implémentez le code dans l'IDE. Voyager abat les barrières entre ces dimensions et donne instantanément à votre IDE le « processus de réflexion » du web.

## Fini les allers-retours entre onglets

Le plus grand calvaire des développeurs : après avoir discuté longuement d'une solution sur le web, vous revenez dans VS Code, Trae ou Cursor, et vous devez réexpliquer les besoins comme à un inconnu. Entre les quotas et la vitesse des réponses, le web est le « cerveau » et l'IDE les « mains ». Voyager leur permet de partager une même âme.

## Trois étapes simples pour synchroniser

1. **Installer et activer CoBridge** :
   Installez l'extension **CoBridge** dans VS Code ou dans un éditeur compatible. Elle sert de pont central entre l'interface web et votre IDE local.
   - **[Installer depuis Open VSX](https://open-vsx.org/extension/windfall/co-bridge)**

   ![Extension CoBridge](/assets/CoBridge-extension.png)

   Après l'installation, **ouvrez n'importe quel répertoire de travail**, cliquez sur l'icône à droite et lancez le serveur.
   ![Serveur CoBridge activé](/assets/CoBridge-on.png)

2. **Connexion et poignée de main** :
   - Dans la section **Synchro du contexte** de la fenêtre de Voyager, réglez **Mode** sur **Manuel**.
   - Faites correspondre **Port du serveur** au port utilisé par CoBridge. Lorsque vous voyez « IDE en ligne », les deux sont connectés.

   ![Console de synchronisation du contexte](/assets/context-sync-console.png)

3. **Synchronisation en un clic** : cliquez sur **Synchroniser vers l'IDE**. Qu'il s'agisse de **tableaux de données** complexes ou d'**images de référence**, tout peut être synchronisé instantanément avec votre IDE.

   ![Synchronisation terminée](/assets/sync-done.png)

## Enracinement dans l'IDE

Une fois la synchronisation terminée, un fichier `.cobridge/AI_CONTEXT.md` apparaît dans le répertoire de travail de votre IDE. Que ce soit Trae, Cursor ou Copilot, ces outils liront automatiquement cette « mémoire » grâce à leurs fichiers de règles respectifs.

```
your-project/
├── .cobridge/
│   ├── images/
│   │   ├── context_img_1_1.png
│   │   └── context_img_1_2.png
│   └── AI_CONTEXT.md
├── .github/
│   └── copilot-instructions.md
├── .gitignore
├── .traerules
└── .cursorrules
```

## Principes

- **Zéro pollution** : CoBridge gère automatiquement le fichier `.gitignore`, pour que vos conversations privées ne soient jamais poussées vers les dépôts Git.
- **Adapté à l'IA** : format Markdown complet, que l'IA de votre IDE lit aussi aisément qu'un manuel d'instructions.
- **Conseil** : si la conversation remonte à un certain temps, faites d'abord défiler avec la [Chronologie](/fr/guide/timeline) pour permettre au web de se « remémorer » le contexte, afin d'obtenir de meilleurs résultats de synchronisation.

---

## Prêt pour le décollage

**La logique est prête dans le cloud ; il ne reste plus qu'à l'enraciner localement.**

- **[Installer l'extension CoBridge](https://open-vsx.org/extension/windfall/co-bridge)** : trouvez votre portail dimensionnel et activez la « respiration synchronisée » en un clic.
- **[Accéder au dépôt GitHub](https://github.com/Winddfall/CoBridge)** : plongez dans la logique de CoBridge, ou mettez une étoile à ce projet de « synchronisation des âmes ».

> **Les LLM ne perdront plus jamais la mémoire ; prêts à l'action dès l'installation.**
