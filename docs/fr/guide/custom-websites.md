# Sites Personnalisés pour le Gestionnaire de Prompts

Le Gestionnaire de Prompts peut désormais être utilisé sur n'importe quel site web de votre choix, pas seulement Gemini et AI Studio.

## Comment Ça Marche

Lorsque vous ajoutez un site web personnalisé :

1. L'extension demande la permission d'accéder uniquement à ce site web spécifique.
2. Le Gestionnaire de Prompts est injecté dans le site.
3. **Seule** la fonctionnalité Gestionnaire de Prompts est activée (pas de chronologie, dossiers, ou autres fonctionnalités).

## Ajouter un Site Web

1. Cliquez sur l'icône de l'extension pour ouvrir la popup.
2. Faites défiler jusqu'à la section **Gestionnaire de Prompts**.
3. Entrez l'URL du site web (ex : `chatgpt.com` ou `claude.ai`).
4. Cliquez sur **Ajouter un site web**.
5. Accordez la permission lorsque demandé.

## Formats d'URL Supportés

Vous pouvez entrer des URL dans divers formats :

- `chatgpt.com`
- `www.chatgpt.com`
- `https://chatgpt.com`
- `claude.ai`

L'extension normalisera automatiquement l'URL et demandera la permission pour les versions `https://` et `https://www.`.

## Confidentialité & Sécurité

- **Contrôle Utilisateur** : Vous ajoutez explicitement les sites web où vous voulez le Gestionnaire de Prompts.
- **Fonctionnalité Limitée** : Seul le Gestionnaire de Prompts est activé sur les sites personnalisés (pas de chronologie, dossiers, etc.).
- **Gestion Facile** : Ajoutez ou supprimez des sites web à tout moment dans la popup de l'extension.

## Exemples

Sites de chat IA populaires où vous pourriez vouloir utiliser le Gestionnaire de Prompts :

- `chatgpt.com` - ChatGPT
- `claude.ai` - Claude
- `copilot.microsoft.com` - Microsoft Copilot
- `bard.google.com` - Google Bard (ancien)
- `poe.com` - Poe

## Supprimer un Site Web

1. Ouvrez la popup de l'extension.
2. Trouvez le site web dans la liste.
3. Cliquez sur **Supprimer**.
4. Le script de contenu sera désenregistré automatiquement.

## Dépannage

### Le Gestionnaire de Prompts n'apparaît pas après l'ajout d'un site

1. **Rechargez la page** - L'extension ne s'active qu'au chargement de la page.
2. Vérifiez que le format de l'URL est correct (ex : `chatgpt.com` pas `chat.openai.com/chatgpt`).
3. Ouvrez la console du navigateur (F12) et cherchez les logs `[Gemini Voyager]`.

### Comment vérifier si ça marche

Ouvrez la console du navigateur (F12) et cherchez :

```
[Gemini Voyager] Checking custom websites: ...
[Gemini Voyager] Is custom website: true
[Gemini Voyager] Custom website detected, starting Prompt Manager only
```

### Vous voulez utiliser d'autres fonctionnalités sur des sites personnalisés ?

Actuellement, seul le Gestionnaire de Prompts est supporté sur les sites personnalisés. Les autres fonctionnalités (Chronologie, Dossiers, etc.) sont spécifiquement conçues pour Gemini et AI Studio et ne fonctionneront pas sur d'autres sites.
