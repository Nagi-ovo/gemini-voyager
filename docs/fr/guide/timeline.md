# Voyage dans le temps

La Chronologie Voyager est un système visuel de navigation dans les conversations, pour Gemini, Claude et ChatGPT. Elle associe chaque message d'une discussion à un nœud interactif, sur le côté droit de l'écran, et transforme les longues conversations IA en une carte navigable où vous pouvez sauter instantanément.

Les longues conversations sont confuses. Vous remontez, vous redescendez, vous perdez votre place.
Voyager transforme votre conversation en chronologie.

Dans les paramètres de Gemini, **Afficher la chronologie** contrôle la barre et ses raccourcis de navigation. La désactiver conserve les favoris et la hiérarchie enregistrés. Les horodatages des messages suivent séparément **Afficher les horodatages des messages**, de sorte que vous pouvez les garder visibles alors que la chronologie est désactivée.

## Voyez la forme de votre discussion

Regardez le côté droit de votre écran.
Chaque nœud représente un message. La chronologie visualise le rythme de votre dialogue.

## La navigation, simplifiée

- **Téléportation** : cliquez sur un nœud pour sauter instantanément à ce message.
- **Coup d'œil** : survolez pour voir ce qu'il contient, sans bouger.
- **Marque-page** : appuyez longuement sur un nœud pour le **mettre en favori**. C'est comme un marque-page pour votre mémoire.
- **Niveaux (expérimental)** : cliquez droit sur un nœud pour lui attribuer un niveau (1 à 3) ou replier ses enfants. Idéal pour rendre lisibles les conversations ramifiées.
- **Redimensionnement** : faites glisser le bord intérieur de la chronologie pour ajuster sa largeur.
- **Clavier** : naviguez à la vitesse de la pensée. Par défaut `j`/`k`, et `gg`/`GG` pour aller au premier ou au dernier tour.

![Navigation dans la chronologie](/assets/teaser.png)

## Favori : marquez vos percées

Les longues conversations enfouissent de l'or. Mettez en favori les moments qui comptent.

**Fonctionnement** : appuyez longuement (environ 0,5 s) sur n'importe quel nœud de la chronologie. Il s'allume : ce message est maintenant en favori.

- Appuyez longuement à nouveau pour retirer le favori.
- Les nœuds en favori restent mis en évidence pour être repérés d'un coup d'œil.
- Retrouvez tous vos messages en favori dans la **Bibliothèque enregistrée** : cliquez sur **Voir la bibliothèque enregistrée** dans la fenêtre de Voyager, ou ouvrez-la depuis le panneau du Gestionnaire de prompts.

Pensez-y comme à un drapeau planté dans la conversation : le moment d'une percée, la réponse parfaite, ou un passage que vous voulez reprendre plus tard.

::: tip Astuce
Les favoris se synchronisent entre appareils si vous avez activé la [Synchro Cloud](/fr/guide/cloud-sync).
:::

## Personnalisez l'apparence

Sous **Options de la chronologie**, dans la fenêtre de Voyager :

- **Style de la chronologie** : `Nœuds`, `Graduations` ou `Compact`.
- **Épingler le panneau d'aperçu** : garde le panneau d'aperçu ouvert à côté de la chronologie. Sa zone de recherche filtre les messages au fil de la frappe.
- **Chronologie déplaçable** : déplacez la chronologie n'importe où sur la page. **Réinitialiser la position de la chronologie** la remet à sa place.

## Encore plus vite avec le clavier

Vous ne voulez pas utiliser la souris ? Utilisez le clavier.

**C'est comme activer le mode Vim dans Gemini.**

### Raccourcis par défaut

- `k` - aller au nœud précédent
- `j` - aller au nœud suivant
- `gg` - aller au premier tour
- `GG` - aller au dernier tour

### Personnalisez-les

Ouvrez les paramètres de l'extension, cliquez sur une case de raccourci, puis appuyez sur la touche de votre choix.
N'importe quelle touche, n'importe quelle combinaison. `n`/`p` ? `,`/`.` ? À vous de voir.

**Mode fluide** : les appuis rapides s'enchaînent sans à-coups.
**Mode saut** : réponse instantanée, vitesse maximale.

## Quand utiliser la chronologie

La chronologie est la plus utile dans les conversations de plus de 10 messages, là où faire défiler devient inefficace :

- **Sessions de recherche** : vous avez demandé à Gemini d'explorer un sujet sur plus de 30 tours. La chronologie vous permet de revenir à l'idée clé sans tout relire.
- **Débogage de code** : une longue conversation de débogage où la solution est apparue au tour 47. Mettez-la en favori, retrouvez-la en un clic plus tard.
- **Apprentissage et tutorat** : progression pas à pas sur un sujet complexe. Utilisez les niveaux pour replier les sections que vous maîtrisez.
- **Relecture de brainstorming** : relisez une session créative pour en extraire les meilleures idées. Les favoris signalent les moments à conserver.

## Chronologie ou défilement manuel

| Capacité                    | Sans chronologie                      | Avec la chronologie Voyager                                 |
| --------------------------- | ------------------------------------- | ----------------------------------------------------------- |
| Trouver un message précis   | Remonter et redescendre sans fin      | Cliquer sur un nœud ou appuyer sur j/k                      |
| Garder les moments clés     | Copier-coller dans des notes externes | Appui long pour mettre en favori, synchronisé dans le cloud |
| Voir la structure           | Lire de manière séquentielle          | Une carte visuelle montre toute la forme d'un coup d'œil    |
| Navigation au clavier       | Non disponible dans Gemini            | Touches style Vim j/k, gg/GG, entièrement personnalisables  |
| Naviguer dans 100+ messages | Plusieurs minutes de défilement       | Saut instantané vers n'importe quel point                   |
| Organiser les longs fils    | Aucun outil intégré                   | Niveaux (1 à 3) et enfants repliables                       |

## Navigateurs pris en charge

La chronologie fonctionne sur Google Gemini, ainsi que sur Claude et ChatGPT grâce aux extensions intégrées, sur Chrome, Edge, Firefox, Safari, Opera et Brave. Les raccourcis clavier, les favoris et les niveaux fonctionnent de la même façon sur toutes les plateformes. Les messages en favori se synchronisent entre appareils lorsque la [Synchro Cloud](/fr/guide/cloud-sync) est activée.

La chronologie n'est pas disponible sur AI Studio. DeepSeek dispose d'une extension de chronologie facultative dans le catalogue d'extensions (elle est livrée désactivée).
