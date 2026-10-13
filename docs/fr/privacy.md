# Politique de confidentialité

Dernière mise à jour : 14 octobre 2026

## Aperçu

Voyager est une extension de navigateur « local d'abord », qui sert à organiser et enrichir les espaces de discussion IA pris en charge. Elle ne traite des données utilisateur limitées que pour fournir les fonctionnalités que vous demandez. Voyager n'exploite aucun backend qui reçoive des conversations, des prompts, l'historique de navigation, des images ou des identifiants de compte, et n'utilise ni publicité ni traceurs d'analyse.

## Données traitées

Selon les fonctionnalités que vous utilisez, Voyager peut traiter :

- **Contenu des sites et communications personnelles** : texte des conversations, prompts, brouillons, images, liens et autres contenus des pages prises en charge, utilisés pour les dossiers, la navigation, l'export, la gestion des prompts, la recherche et les fonctions d'interface.
- **Identifiants de compte** : un service Google pris en charge peut exposer l'adresse e-mail de la session. Voyager la convertit en identifiant de compte local afin que les données de différents comptes restent séparées. Voyager n'envoie pas l'adresse e-mail brute à qui que ce soit.
- **Historique web et activité de l'utilisateur** : URL des sites pris en charge, routes des conversations, et événements limités de page, d'interaction et de réseau nécessaires à la navigation, aux raccourcis, aux affichages d'usage, aux notifications de fin de réponse et aux autres fonctions demandées. Ces données ne servent ni au profilage ni à la publicité.
- **Informations d'authentification** : un jeton OAuth2 avec la portée `drive.file`, uniquement lorsque vous activez explicitement la synchronisation Google Drive.
- **Données et réglages de l'extension** : dossiers, modèles de prompts, brouillons, messages favoris, instantanés d'usage, état des extensions et préférences d'interface.

Ces données sont stockées localement dans `chrome.storage.local` ou, pour les réglages pris en charge, dans `chrome.storage.sync`. Elles restent sur votre appareil ou dans votre compte de synchronisation du navigateur, sauf si vous utilisez explicitement un transfert décrit ci-dessous.

## Transferts demandés par l'utilisateur

- **Synchronisation Google Drive (facultative)** : les données de sauvegarde sélectionnées passent directement entre votre appareil et votre propre Google Drive. Chrome, Edge et Firefox utilisent l'API d'identité du navigateur ; l'application Safari distribuée directement utilise la connexion Google native et conserve les identifiants dans le Trousseau macOS. Les deux méthodes ne demandent que la portée limitée `drive.file`, et les jetons OAuth ne sont envoyés à aucun serveur Voyager.
- **Synchronisation iCloud sur Safari (facultative)** : les données de sauvegarde sélectionnées sont transférées par l'extension Safari native directement vers votre base CloudKit privée, dans votre compte iCloud. Voyager ne reçoit ni votre identifiant Apple ni de jeton d'authentification iCloud, et le développeur ne peut pas accéder aux enregistrements de cette base privée.
- **Exports et images** : lorsque vous demandez un export, Voyager peut récupérer des images depuis leurs sources existantes hébergées par la page, et peut demander un accès temporaire nécessaire pour capturer le contenu d'interface généré. Le fichier obtenu est créé pour vous ; il n'est pas envoyé à un serveur Voyager.
- **Ressources publiques du projet** : Voyager peut demander des ressources publiques de publication, d'annonce ou de documentation. Ces requêtes ne contiennent aucun contenu de conversation ni de prompt.
- **Mises à jour du catalogue d'extensions** : sur un site où vous avez activé au moins une extension, Voyager peut récupérer en HTTPS le fichier de catalogue de ce site à l'adresse `https://voyager.nagi.fun/catalog/hosts/<hôte du site>.json`, par exemple `https://voyager.nagi.fun/catalog/hosts/chat.deepseek.com.json`. La vérification a lieu uniquement à l'ouverture d'une telle page ou à l'ouverture de la fenêtre de l'extension sur cette page, et seulement si la dernière vérification est plus ancienne que l'intervalle que vous avez choisi (6 heures par défaut ; 1 heure, 6 heures, 24 heures, ou manuel uniquement). Les pages Gemini et AI Studio n'utilisent que les extensions officielles fournies avec l'extension et ne déclenchent jamais de requête. La requête est un simple GET qui ne transporte ni cookies, ni identifiant de compte ou d'extension, ni contenu de page ou de conversation ; comme pour toute requête web, le serveur voit l'adresse IP et le user agent du navigateur, ainsi que le nom d'hôte du site dans le chemin de l'URL. Sur les sites d'extensions, la fenêtre de l'extension propose un interrupteur « Mises à jour en ligne des extensions » et le sélecteur d'intervalle de vérification ; ces deux réglages sont enregistrés dans le stockage de synchronisation du navigateur et inclus dans la sauvegarde des paramètres. Interrupteur désactivé, Voyager ne contacte voyager.nagi.fun que si vous appuyez sur « Rechercher les mises à jour d'extensions maintenant ». Si la requête échoue ou si le site n'a pas de fichier de catalogue, l'instantané d'extensions fourni avec l'extension reste utilisé. Un catalogue récupéré ne contient que du CSS et du JSON, validés et assainis avant utilisation ; aucun JavaScript n'est téléchargé ni exécuté. Cette vérification est distincte de la vérification des annonces, qui a son propre réglage. voyager.nagi.fun est un hébergement statique derrière un proxy Cloudflare ; le projet Voyager ne journalise ni ne conserve ces requêtes, et les métadonnées de connexion (adresse IP, User-Agent) sont traitées par les hébergeurs selon leurs propres politiques de confidentialité.

Voyager ne vend pas les données des utilisateurs et ne les transfère ni à des fins publicitaires, ni pour évaluer la solvabilité, ni pour des usages sans rapport avec les fonctions de l'extension destinées à l'utilisateur.

## Autorisations

- **Storage (stockage)** : enregistre les données et préférences de l'extension localement et, lorsque c'est pris en charge, via la synchronisation du navigateur. Chrome, Edge et Firefox accordent aussi `unlimitedStorage` pour que les données locales ne soient pas bloquées par le quota par défaut du navigateur ; Voyager applique tout de même sa propre limite de stockage. Sur Safari, cette autorisation est facultative.
- **Identity (identité)** : authentifie la synchronisation Google Drive facultative, après une action explicite de l'utilisateur. La synchronisation iCloud sur Safari utilise le compte iCloud système du Mac plutôt que cette autorisation du navigateur.
- **Scripting (scripts)** : n'injecte que des scripts fournis avec l'extension sur les sites pris en charge ; aucun JavaScript ni WebAssembly distant n'est exécuté.
- **Active tab et contenu déclaratif** : identifie le site pris en charge que vous ouvrez et affiche les commandes propres à ce site. Le contenu déclaratif n'est utilisé que sur Chrome et Edge.
- **Alarms (alarmes)** : lance des vérifications périodiques des annonces publiques de compatibilité.
- **Notifications (facultatives)** : demandées uniquement lorsque vous activez les notifications de fin de réponse.
- **Permissions d'hôte** : accordées à l'installation pour Gemini, Gemini Enterprise et AI Studio, ainsi que pour les domaines Google nécessaires aux opérations Google Drive et aux images que vous demandez.
- **Permissions d'hôte facultatives** : Claude, ChatGPT, DeepSeek et les sites personnalisés ne sont accessibles qu'après que vous avez activé Voyager ou une extension pour ce site et approuvé la demande d'autorisation du navigateur. `<all_urls>` peut aussi être demandé temporairement lorsque vous choisissez un export qui capture du contenu d'interface généré ; si vous refusez, l'export se poursuit sans cette capture.

## Conservation et contrôle par l'utilisateur

Les données locales et celles de la synchronisation du navigateur restent en place jusqu'à ce que vous les supprimiez, que vous vidiez le stockage de l'extension ou que vous désinstalliez l'extension. Les sauvegardes cloud restent dans le Google Drive ou le compte iCloud que vous avez choisi, jusqu'à ce que vous les retiriez de ce compte. Vous pouvez désactiver les fonctions facultatives et révoquer l'accès facultatif aux sites ou l'autorisation Google, depuis Voyager et les paramètres du navigateur.

## Utilisation limitée des API Google

L'utilisation et le transfert, par Voyager, des informations reçues des API Google respectent la politique relative aux données utilisateur du Chrome Web Store, y compris les exigences d'utilisation limitée.

## Modifications de cette politique

Nous pouvons mettre à jour cette politique de confidentialité à mesure que Voyager évolue. La dernière version et sa date de mise à jour seront publiées sur cette page.

## Nous contacter

Pour toute question sur la confidentialité, contactez-nous via le [dépôt GitHub de Voyager](https://github.com/voyager-crew/voyager).
