# Transport de mémoire : Synchronisation du contexte (Expérimental)

**Différentes dimensions, partage fluide**

Élaborez la logique sur le web et implémentez le code dans l'IDE. Gemini Voyager brise les barrières dimensionnelles, dotant instantanément votre IDE du « processus de réflexion » du web.

## Fini les sauts d'onglets incessants

Le plus grand calvaire des développeurs : après avoir discuté longuement d'une solution sur le web, vous retournez sur VS Code/Trae/Cursor et devez réexpliquer les besoins comme à un étranger. En raison des quotas et de la vitesse de réponse, le web est le « cerveau » et l'IDE les « mains ». Voyager leur permet de partager une même âme.

## Trois étapes simples pour synchroniser

1. **Installer et activer CoBridge** :
   Installez l'extension **CoBridge** dans VS Code. C'est le pont central qui relie l'interface web à votre IDE local.
   - **[Installer via le VS Code Marketplace](https://open-vsx.org/extension/windfall/co-bridge)**

   ![Extension CoBridge](/assets/CoBridge-extension.png)

   Après l'installation, cliquez sur l'icône à droite et lancez le serveur.
   ![Serveur CoBridge activé](/assets/CoBridge-on.png)

2. **Connexion et poignée de main** :
   - Activez la « Synchronisation du contexte » dans les paramètres de Voyager.
   - Alignez les numéros de port. Lorsque vous voyez « IDE en ligne », ils sont connectés.

   ![Console de synchronisation du contexte](/assets/context-sync-console.png)

3. **Synchronisation en un clic** : Cliquez sur **« Synchroniser vers l'IDE »**. Qu'il s'agisse de **tableaux de données** complexes ou d'**images de référence** intuitives, tout peut être synchronisé instantanément avec votre IDE.

   ![Synchronisation terminée](/assets/sync-done.png)

## Enracinement dans l'IDE

Une fois la synchronisation terminée, un fichier `.cobridge/AI_CONTEXT.md` apparaîtra dans le répertoire racine de votre IDE. Que ce soit Trae, Cursor ou Copilot, ils liront automatiquement cette « mémoire » via leurs fichiers Rule respectifs.

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

- **Zéro pollution** : CoBridge gère automatiquement le fichier `.gitignore`, garantissant que vos conversations privées ne sont jamais poussées vers les dépôts Git.
- **Adapté à l'IA** : Format Markdown complet, rendant la lecture par l'IA de votre IDE aussi fluide que celle d'un manuel d'instructions.
- **Conseil** : Si la conversation date d'un certain temps, remontez d'abord avec la [Timeline] pour permettre au web de se « remémorer » le contexte afin d'obtenir de meilleurs résultats de synchronisation.

---

## Prêt pour le Décollage

**La réflexion est prête dans le cloud, laissez-la maintenant s'enraciner localement.**

- **[Installer l'extension CoBridge](https://open-vsx.org/extension/windfall/co-bridge)** : Trouvez votre portail dimensionnel et activez la « respiration synchronisée » en un clic.
- **[Visiter le dépôt GitHub](https://github.com/Winddfall/CoBridge)** : Plongez dans la logique profonde de CoBridge ou donnez une Star à ce projet de « synchronisation d'âme ».

> **Les grands modèles ne perdent plus la mémoire ; prêts pour l'action immédiate.**
