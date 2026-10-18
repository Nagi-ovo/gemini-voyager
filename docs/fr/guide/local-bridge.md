# Pont local ChatGPT

ChatGPT · Pont local est un plugin officiel de Voyager, désactivé par défaut.

Une fois activé et associé, Voyager met un ensemble d’actions sur la page ChatGPT à la disposition des programmes locaux de cet ordinateur. Un programme indique ce qu’il veut faire, et Voyager s’en charge dans un onglet qu’il ouvre lui-même, avec le ChatGPT auquel vous êtes déjà connecté dans votre navigateur. Pour ChatGPT, c’est une conversation ordinaire venant de votre propre navigateur.

## Ce qu’il propose

- Ouvrir une conversation : nouvelle ou existante
- Choisir le modèle : en mode chat uniquement ; il ne fait jamais passer ChatGPT en mode Work
- Envoyer une question, avec des pièces jointes
- Attendre la réponse et la lire
- Lire la dernière réponse d’une conversation existante
- Lister et créer des projets
- Lister, téléverser et supprimer les fichiers d’un projet (la suppression est immédiate et définitive)

## Comment il se comporte

**Local uniquement.** Le pont ne communique avec les programmes de cet ordinateur que via `127.0.0.1`, et seulement après l’association.

**Son propre onglet.** Chaque tâche s’exécute dans un onglet ChatGPT ouvert par Voyager, qui se ferme une fois la tâche terminée.

**Une tâche à la fois.** Une seule tâche s’exécute à la fois.

**La connexion et les vérifications vous reviennent.** Si ChatGPT vous demande de vous connecter ou de passer une vérification, le pont s’arrête et le signale. Il ne la contourne jamais.

**Votre abonnement, indiqué.** Chaque résultat indique votre abonnement ChatGPT (`Pro Lite ($100)`, `Pro ($200)`, …) tel que la page l’a signalé en dernier.

**Navigateurs.** Testé dans Chrome. Les versions Edge et Firefox de Voyager incluent aussi le pont ; la version Safari, non.

## Utilisation de référence : Voyager CLI

[Voyager CLI](https://github.com/voyager-crew/voyager-cli) (npm `@voyager-crew/cli`, commande `voyager`) est un client de référence construit sur ces actions : interrogez ChatGPT depuis votre terminal, ou laissez votre agent de code s’en charger.

### En trois étapes

1. Installez le CLI (Node.js 20.3 ou plus récent) :

   ```sh
   npm install -g @voyager-crew/cli
   ```

2. Dans la fenêtre de Voyager, ouvrez **Extensions**, activez **ChatGPT · Pont local** et autorisez l’accès à chatgpt.com.
3. Associez-les une fois :

   ```sh
   voyager pair
   ```

   Saisissez le code à huit caractères qu’il affiche dans les réglages « Pont local » de la fenêtre de Voyager.

### Quelques exemples

```sh
voyager ask "Explique cette trace d’erreur" --attach crash.log
voyager ask --chat <link|id> "Et les cas limites ?" # poursuivre une conversation
voyager read <link|id>                              # enregistrer la dernière réponse d’une conversation
voyager project upload "Thèse" ./thesis             # lisible par toutes les conversations du projet
voyager ask --project "Thèse" "Où l’argumentation est-elle la plus faible ?"
```

La réponse est enregistrée dans `response.md`, et les questions utilisent par défaut GPT-6 Pro en mode chat.

Pour attendre une longue réponse, le sens de chaque code de sortie et toutes les commandes, voir le [README du CLI](https://github.com/voyager-crew/voyager-cli#readme). Les instructions pour Claude Code, Codex et les autres agents sont dans [SKILL.md](https://github.com/voyager-crew/voyager-cli/blob/main/skills/voyager/SKILL.md).

## Avertissement

- Voyager et Voyager CLI sont des projets open source communautaires. Ils ne sont ni affiliés à OpenAI ni approuvés par OpenAI.
- Le pont automatise ChatGPT sur le web dans votre propre navigateur connecté. Les [conditions d'utilisation](https://openai.com/policies/terms-of-use/) d'OpenAI limitent l'extraction de résultats par des moyens automatisés ou programmatiques : jugez vous-même si votre usage les respecte avant de vous y fier. Toute restriction appliquée à votre compte en conséquence est à vos risques.
- Les outils similaires adoptent la même position : [oracle](https://github.com/steipete/oracle), par exemple, fait de son mode navigateur une fonction expérimentale à activer soi-même et oriente vers l'API ceux qui veulent éviter ce risque. Pour un usage pris en charge, utilisez l'API OpenAI.
- Le pont sert à votre propre confort, sur votre propre ordinateur : n'y connectez que votre compte, ne l'utilisez pas pour servir d'autres personnes, partager un compte ou revendre votre usage, et uniquement à des fins légales.
