# Cloud Sync

Voyager Cloud Sync backs up your folders, prompt library, starred messages, and supported settings. Choose Google Drive on any supported browser, or iCloud on Safari. Data moves directly between Voyager and the personal cloud account you select; Voyager does not operate a sync server.

## What Gets Synced

| Data Type            | Synced | Details                                                                      |
| -------------------- | ------ | ---------------------------------------------------------------------------- |
| Folder structure     | Yes    | All folders, nesting, colors, and conversation assignments                   |
| Prompt library       | Yes    | All saved prompts with tags and folder organization                          |
| Starred messages     | Yes    | Timeline bookmarks from any conversation                                     |
| Extension settings   | Yes    | Cross-device preferences such as sorting, colors, and input behavior         |
| Plugin configuration | Yes    | Install/enable state and plugin settings; site permissions remain per-device |
| Conversation content | No     | Chat content stays on Google's servers                                       |

## Features

- **Multi-Device Sync**: Keep your configurations in sync across multiple computers.
- **Data Privacy**: Data is stored in your own Google Drive or private iCloud database, without a Voyager server.
- **Flexible Sync**: Support for manual uploading and downloading/merging of data.

::: info
Device identifiers, access tokens, caches, viewport coordinates, and temporary runtime state are intentionally not synced as personalization settings.
:::

## How to Use

1. Click the extension icon in the bottom-right corner of the Gemini™ page to open the settings panel.
2. Locate the **Cloud Sync** section.
3. On Safari, choose **Google Drive** or **iCloud**. Other browsers use Google Drive.
4. For Google Drive, click **Sign in with Google** and complete authorization. For iCloud, make sure the Mac is signed in to iCloud.
5. Click **Upload to Cloud** to sync local data, or **Download & Merge** to merge cloud data into this browser.

### 💡 Quick Sync

The easiest way is to click the **"Upload to Cloud"** or **"Download & Merge"** buttons at the top of the folder area in the left sidebar.

<img src="/assets/cloud-sync.png" alt="Cloud Sync Quick Buttons" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); margin-top: 10px; max-width: 600px;"/>

::: warning
**Security Recommendation: Double Protection**  
While Cloud Sync offers great convenience, we strongly recommend that you also periodically back up your core data using **local files**.

1. **Full Export**: Export a complete package containing all settings, folders, and prompts from "Backup & Restore" at the bottom of the settings panel.
   <img src="/assets/manual-export-all.png" alt="Full Export" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); margin-top: 10px; max-width: 600px;"/>
2. **Export All Folders**: Click "Export" in the "Folders" section of the settings panel to back up all your folders and conversations, excluding prompts.
   <img src="/assets/manual-folder-export.png" alt="Export All Folders" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); margin-top: 10px; max-width: 600px;"/>
   :::

## Cloud Sync vs. Manual Backup

| Aspect         | Manual Backup (Export/Import)     | Cloud Sync                                      |
| -------------- | --------------------------------- | ----------------------------------------------- |
| Frequency      | Whenever you remember             | On-demand with one click                        |
| Data location  | Local file on your computer       | Your Google Drive or private iCloud database    |
| Cross-device   | Requires transferring files       | Devices signed in to the selected cloud account |
| Merge behavior | Replaces or requires manual merge | Intelligent merge without duplicating           |
| Privacy        | File stays on your machine        | Stored in your personal cloud account           |

## How It Works

1. **Provider**: Google Drive uses the limited `drive.file` permission, so Voyager can only access files it created. On Safari, iCloud uses the app's private CloudKit database and does not expose an Apple ID token to Voyager.
2. **Upload**: When you click "Upload to Cloud," Voyager writes separate backup files for folders, prompts, stars, forks, timeline hierarchy, personalization settings, and plugin configuration to the selected provider. Highlight data is included when highlight cloud sync is enabled.
3. **Download & Merge**: When you click "Download & Merge" on another device, Voyager reads those files and merges them by data type. New folders and prompts are added without duplication, cloud preferences are restored, and plugin entries are merged by plugin ID.
4. **No background sync**: Sync is manual and on-demand. Voyager never syncs without your explicit action.

Switching providers does not copy data between them and does not write to both providers. Upload once after switching if you want the current local data in the newly selected provider.

## Supported Platforms

Google Drive sync works on Chrome, Edge, Firefox, and Safari. iCloud sync is available only in the directly distributed Safari app and uses the iCloud account signed in on the Mac.
