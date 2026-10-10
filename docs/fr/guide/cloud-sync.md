# Synchronisation Cloud

Synchronisez vos dossiers, votre bibliothèque de prompts et d'autres données sur Google Drive pour garder votre expérience cohérente sur tous vos appareils.

## Fonctionnalités

- **Synchronisation multi-appareils** : Gardez vos configurations synchronisées sur plusieurs ordinateurs grâce à Google Drive.
- **Confidentialité des données** : Les données sont stockées directement dans votre propre espace Google Drive, garantissant la confidentialité sans serveurs tiers.
- **Synchronisation flexible** : Prise en charge du téléchargement manuel et de la fusion des données.

## Données favorites et limites de synchronisation

Les sauvegardes cloud incluent le **texte complet des prompts utilisateur marqués d’une étoile** (jusqu’à 16 KiB UTF-8 par prompt) dans votre propre Google Drive ou iCloud. Les sauvegardes des favoris ne stockent pas les réponses du modèle. La sauvegarde v1 conserve seulement les aperçus ; la nouvelle v2 inclut le texte et les enregistrements de suppression.

Les enregistrements de suppression sont conservés pendant 180 jours. Les anciennes versions de Voyager les ignorent et peuvent afficher ou renvoyer des favoris supprimés ; les nouvelles bloquent les anciennes copies dont l’horodatage est inchangé. Un nouvel ajout plus récent, ou l’expiration de l’enregistrement, peut restaurer un favori. Une longue période hors ligne et les écarts d’horloge peuvent aussi affecter les suppressions.

La synchronisation fusionne et vérifie les écritures, avec trois tentatives au maximum, mais n’est pas une transaction atomique entre appareils : des envois simultanés peuvent s’écraser. Une synchronisation ultérieure depuis un appareil conservant les données manquantes peut les rétablir ; sinon, la récupération n’est pas garantie. Les échecs partiels conservent les écritures acceptées ; relancez la synchronisation pour terminer la réparation.

## Comment utiliser

1. Cliquez sur l'icône de l'extension dans le coin inférieur droit de la page Gemini™ pour ouvrir le panneau des paramètres.
2. Localisez la section **Synchronisation Cloud**.
3. Cliquez sur **Se connecter avec Google** et complétez l'autorisation.
4. Une fois autorisé, cliquez sur **Télécharger vers le Cloud** pour synchroniser vos données locales vers le cloud, ou sur **Télécharger et fusionner** pour ramener les données du cloud vers votre machine locale.

### 💡 Synchronisation rapide

La façon la plus simple est de cliquer sur les boutons **"Télécharger vers le Cloud"** ou **"Télécharger et fusionner"** en haut de la zone des dossiers dans la barre latérale gauche.

<img src="/assets/cloud-sync.png" alt="Boutons de synchronisation rapide Cloud" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); margin-top: 10px; max-width: 600px;"/>

::: warning
**Recommandation de sécurité : Double protection**  
Bien que la synchronisation Cloud offre une grande commodité, nous vous recommandons vivement de sauvegarder également périodiquement vos données de base à l'aide de **fichiers locaux**.

1. **Exportation complète** : Exportez un package complet contenant tous les paramètres, dossiers et prompts depuis « Sauvegarde et restauration » en bas du panneau de configuration.
   <img src="/assets/manual-export-all.png" alt="Exportation complète" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); margin-top: 10px; max-width: 600px;"/>
2. **Exporter tous les dossiers** : Cliquez sur « Exporter » dans la section « Dossiers » du panneau de configuration pour sauvegarder tous vos dossiers et conversations, sans inclure les prompts.
   <img src="/assets/manual-folder-export.png" alt="Exporter tous les dossiers" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); margin-top: 10px; max-width: 600px;"/>
   :::
