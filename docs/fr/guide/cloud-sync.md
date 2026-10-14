# Synchronisation Cloud

La Synchro Cloud de Voyager sauvegarde vos dossiers, votre bibliothèque de prompts, vos messages favoris et les réglages compatibles. Choisissez Google Drive sur tous les navigateurs pris en charge, ou iCloud sur Safari. Les données passent directement entre Voyager et le compte cloud personnel que vous sélectionnez ; Voyager n'exploite aucun serveur de synchronisation.

## Données synchronisées

| Type de données              | Synchronisé | Détails                                                                                                                       |
| ---------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Structure des dossiers       | Oui         | Tous les dossiers, l'imbrication, les couleurs et le rattachement des conversations                                           |
| Bibliothèque de prompts      | Oui         | Tous les prompts enregistrés, avec leurs étiquettes et leur organisation en dossiers                                          |
| Messages favoris             | Oui         | Signets de la chronologie, issus de n'importe quelle conversation                                                             |
| Réglages de l'extension      | Oui         | Préférences à synchroniser entre appareils, comme le tri, les couleurs et le comportement de saisie                           |
| Configuration des extensions | Oui         | État d'installation et d'activation, et réglages des extensions ; les autorisations de site restent propres à chaque appareil |
| Réponses du modèle           | Non         | Les sauvegardes des favoris contiennent les prompts utilisateur, pas les réponses du modèle                                   |

## Données favorites et limites de synchronisation

Les sauvegardes cloud incluent le **texte complet des prompts utilisateur marqués d’une étoile** (jusqu’à 16 KiB UTF-8 par prompt) dans votre propre Google Drive ou iCloud. Les sauvegardes des favoris ne stockent pas les réponses du modèle. La sauvegarde v1 conserve seulement les aperçus ; la nouvelle v2 inclut le texte et les enregistrements de suppression.

Les enregistrements de suppression sont conservés pendant 180 jours. Les anciennes versions de Voyager les ignorent et peuvent afficher ou renvoyer des favoris supprimés ; les nouvelles bloquent les anciennes copies dont l’horodatage est inchangé. Un nouvel ajout plus récent, ou l’expiration de l’enregistrement, peut restaurer un favori. Une longue période hors ligne et les écarts d’horloge peuvent aussi affecter les suppressions.

La synchronisation fusionne et vérifie les écritures, avec trois tentatives au maximum, mais n’est pas une transaction atomique entre appareils : des envois simultanés peuvent s’écraser. Une synchronisation ultérieure depuis un appareil conservant les données manquantes peut les rétablir ; sinon, la récupération n’est pas garantie. Les échecs partiels conservent les écritures acceptées ; relancez la synchronisation pour terminer la réparation.

## Fonctionnalités

- **Synchronisation multi-appareils** : Gardez vos configurations synchronisées sur plusieurs ordinateurs.
- **Confidentialité des données** : Les données sont stockées directement dans votre propre espace Google Drive ou votre base iCloud privée, garantissant la confidentialité sans serveur Voyager.
- **Synchronisation flexible** : Prise en charge de l'envoi manuel, du téléchargement et de la fusion des données.

::: info
Les identifiants d'appareil, les jetons d'accès, les caches, les coordonnées d'affichage et l'état temporaire d'exécution ne sont volontairement pas synchronisés comme réglages personnels.
:::

## Comment utiliser

1. Cliquez sur l'icône Voyager dans la barre d'outils du navigateur pour ouvrir le panneau des paramètres.
2. Localisez la section **Synchro Cloud**.
3. Sur Safari, choisissez **Google Drive** ou **iCloud**. Les autres navigateurs utilisent Google Drive.
4. Pour Google Drive, cliquez sur **Connexion Google** et terminez l'autorisation. Pour iCloud, vérifiez que le Mac est connecté à iCloud.
5. Cliquez sur **Envoyer** pour transférer vos données locales vers le cloud, ou sur **Récupérer** pour fusionner les données du cloud dans ce navigateur. **Remplacer** remplace les données locales par la copie du cloud au lieu de les fusionner : tout ce que vous n'avez pas encore envoyé sera perdu.

Avec iCloud, **Supprimer la sauvegarde iCloud** retire toutes les sauvegardes Voyager d'iCloud ; les données locales du Mac restent intactes.

### 💡 Synchronisation rapide

La façon la plus simple est de cliquer sur les boutons **"Téléverser vers le cloud"** ou **"Synchroniser depuis le cloud"** en haut de la zone des dossiers dans la barre latérale gauche.

<img src="/assets/cloud-sync.png" alt="Boutons de synchronisation rapide Cloud" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); margin-top: 10px; max-width: 600px;"/>

::: warning
**Recommandation de sécurité : Double protection**\
Bien que la synchronisation Cloud offre une grande commodité, nous vous recommandons vivement de sauvegarder également périodiquement vos données de base à l'aide de **fichiers locaux**.

1. **Dossiers** : ouvrez le menu de la zone des dossiers, choisissez **Importer/Exporter dossiers**, puis **Exporter dossiers** pour enregistrer tous vos dossiers et leurs conversations.
2. **Prompts** : dans le Gestionnaire de prompts, cliquez sur **Exporter** pour enregistrer votre bibliothèque de prompts.
   :::

## Synchro Cloud ou sauvegarde manuelle

| Critère         | Sauvegarde manuelle (export/import)      | Synchro Cloud                                   |
| --------------- | ---------------------------------------- | ----------------------------------------------- |
| Fréquence       | Quand vous y pensez                      | À la demande, en un clic                        |
| Emplacement     | Fichier local sur votre ordinateur       | Votre Google Drive ou votre base iCloud privée  |
| Multi-appareils | Nécessite de transférer des fichiers     | Appareils connectés au compte cloud sélectionné |
| Fusion          | Remplace, ou demande une fusion manuelle | Fusion intelligente, sans doublons              |
| Confidentialité | Le fichier reste sur votre machine       | Stocké dans votre compte cloud personnel        |

## Fonctionnement

1. **Fournisseur** : Google Drive utilise l'autorisation limitée `drive.file`, de sorte que Voyager ne peut accéder qu'aux fichiers qu'il a créés. Sur Safari, iCloud utilise la base CloudKit privée de l'application et ne transmet aucun jeton d'identifiant Apple à Voyager.
2. **Envoi** : quand vous cliquez sur **Envoyer**, Voyager écrit séparément, chez le fournisseur choisi, les fichiers de sauvegarde des dossiers, des prompts, des favoris, des bifurcations, de la hiérarchie de la chronologie, des réglages de personnalisation et de la configuration des extensions. Les données de surlignage sont incluses lorsque leur synchronisation cloud est activée.
3. **Récupération et fusion** : quand vous cliquez sur **Récupérer** sur un autre appareil, Voyager lit ces fichiers et les fusionne par type de données. Les nouveaux dossiers et prompts sont ajoutés sans doublons, les préférences du cloud sont restaurées, et les entrées d'extensions sont fusionnées selon leur identifiant.
4. **Pas de synchronisation en arrière-plan** : la synchronisation est manuelle et à la demande. Voyager ne synchronise jamais sans votre action explicite.

Changer de fournisseur ne copie pas les données de l'un vers l'autre et n'écrit pas chez les deux. Si vous voulez que les données locales actuelles se retrouvent chez le nouveau fournisseur, envoyez-les une fois après le changement.

## Plateformes prises en charge

La synchronisation Google Drive fonctionne sur Chrome, Edge, Firefox et Safari. La synchronisation iCloud n'est disponible que dans l'application Safari distribuée directement et utilise le compte iCloud connecté sur le Mac.
