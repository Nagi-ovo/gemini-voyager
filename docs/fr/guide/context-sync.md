# Synchronisation du Contexte : Transfert de Mémoires (Expérimental)

**Différentes dimensions, partage fluide**

Élaborez la logique sur le web et implémentez le code dans l'IDE. Gemini Voyager brise les barrières dimensionnelles, dotant instantanément votre IDE du « processus de réflexion » du web.

## Dites adieu aux allers-retours incessants

Le plus grand calvaire des développeurs : après avoir discuté longuement d'une solution sur le web, vous retournez sur VS Code/Trae/Cursor et devez réexpliquer les besoins comme à un étranger. En raison des quotas et de la vitesse de réponse, le web est le « cerveau » et l'IDE les « mains ». Voyager leur permet de partager une même âme.

## Trois étapes simples pour synchroniser

1. **Réveillez CoBridge** : Installez l'extension **CoBridge** depuis le VS Code Marketplace et lancez-la. C'est le pont qui relie le web à votre machine locale.
   ![Extension CoBridge](/assets/CoBridge-extension.png)

   ![Serveur CoBridge activé](/assets/CoBridge-on.png)

2. **Connexion et poignée de main** :
   - Activez la « Synchronisation du contexte » dans les paramètres de Voyager.
   - Alignez les numéros de port. Lorsque vous voyez « IDE en ligne », ils sont connectés.

   ![Console de synchronisation du contexte](/assets/context-sync-console.png)

3. **Synchronisation en un clic** : Cliquez sur **« Synchroniser vers l'IDE »**.

   ![Synchronisation terminée](/assets/sync-done.png)

## Enracinement dans l'IDE

Une fois la synchronisation terminée, un fichier `.vscode/AI_CONTEXT_SYNC.md` apparaîtra à la racine de votre IDE. Qu'il s'agisse de Trae, Cursor ou Copilot, ils liront automatiquement cette « mémoire » via leurs fichiers de règles respectifs. **Les modèles d'IA ne souffriront plus de perte de mémoire et seront opérationnels immédiatement.**

## Principes

- **Zéro pollution** : CoBridge gère automatiquement le fichier `.gitignore`, garantissant que vos conversations privées ne sont jamais poussées vers les dépôts Git.
- **Adapté à l'IA** : Format Markdown complet, rendant la lecture par l'IA de votre IDE aussi fluide que celle d'un manuel d'instructions.
- **Conseil** : Si la conversation date d'un certain temps, remontez d'abord avec la [Timeline] pour permettre au web de se « remémorer » le contexte afin d'obtenir de meilleurs résultats de synchronisation.
