# Cloud Sync

Voyager Cloud Sync backs up your folders, prompt library, and starred messages to your personal Google Drive. It uses OAuth2 with the `drive.file` scope, which means Voyager can only access files it created — it cannot read or modify any other file in your Drive. No third-party servers are involved; data flows directly between your browser and Google Drive.

## What Gets Synced

| Data Type            | Synced | Details                                                    |
| -------------------- | ------ | ---------------------------------------------------------- |
| Folder structure     | Yes    | All folders, nesting, colors, and conversation assignments |
| Prompt library       | Yes    | All saved prompts with tags and folder organization        |
| Starred messages     | Yes    | Timeline bookmarks from any conversation                   |
| Extension settings   | No     | Settings remain local to each browser                      |
| Conversation content | No     | Chat content stays on Google's servers                     |

## Features

- **Multi-Device Sync**: Keep your configurations in sync across multiple computers using Google Drive.
- **Data Privacy**: Data is stored directly in your own Google Drive storage, ensuring privacy without third-party servers.
- **Flexible Sync**: Support for manual uploading and downloading/merging of data.

::: info
**Coming Soon**: The next version will support syncing starred conversations.
:::

## How to Use

1. Click the extension icon in the bottom-right corner of the Gemini™ page to open the settings panel.
2. Locate the **Cloud Sync** section.
3. Click **Sign in with Google** and complete the authorization.
4. Once authorized, click **Upload to Cloud** to sync your local data to the cloud, or **Download & Merge** to bring cloud data to your local machine.

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

| Aspect         | Manual Backup (Export/Import)     | Cloud Sync                                 |
| -------------- | --------------------------------- | ------------------------------------------ |
| Frequency      | Whenever you remember             | On-demand with one click                   |
| Data location  | Local file on your computer       | Your Google Drive                          |
| Cross-device   | Requires transferring files       | Any device with your Google account        |
| Merge behavior | Replaces or requires manual merge | Intelligent merge without duplicating      |
| Privacy        | File stays on your machine        | Encrypted in transit, stored in your Drive |

## How It Works

1. **Authorization**: You sign in with Google and grant Voyager the `drive.file` permission — the most restrictive Drive scope available. Voyager can only see files it created.
2. **Upload**: When you click "Upload to Cloud," Voyager serializes your folders, prompts, and stars into a JSON file and writes it to a dedicated folder in your Google Drive.
3. **Download & Merge**: When you click "Download & Merge" on another device, Voyager reads the JSON file and intelligently merges it with your local data. New folders and prompts are added; existing ones are updated without duplicating.
4. **No background sync**: Sync is manual and on-demand. Voyager never syncs without your explicit action.

## Supported Platforms

Cloud Sync works on Chrome, Edge, and Firefox. It is not available on Safari due to browser limitations with OAuth2 flows in extensions. On all supported platforms, the same Google account accesses the same Drive data, making cross-browser usage seamless.
