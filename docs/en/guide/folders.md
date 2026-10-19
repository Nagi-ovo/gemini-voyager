# Folders

Keep your chats in folders in the sidebar: drag one in and it's filed, nest folders three levels deep, and get the same folders back on another computer.

<SiteSupport feature="folders" :labels="{ folders: 'Sidebar folders', 'hide-filed': 'Hide filed chats', activity: 'Activity view', 'account-isolation': 'Account isolation', projects: 'Folders as projects', 'ai-organize': 'AI Organize' }" />

Only on some sites:

- **Move to folder** in the site's own chat menu: Gemini, ChatGPT, Claude
- Dragging from the Library table into a folder: AI Studio
- Chat icons by Gem type: Gemini

A circled ✓ works as soon as Voyager is installed. On the other sites, open the Voyager popup on that site and turn folders on in the **Plugins** area; the first time, it asks for access to the site.

## Where it is

The folder section sits above the chat list in the sidebar. When the sidebar is closed, the same folders are available in a floating panel.

<img src="/assets/gemini-folders.png" alt="The folder section in the sidebar" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-width: 320px;"/>

## File a chat

- **Drag**: drag a chat from the sidebar onto a folder.
- **Chat menu**: on sites that support it, open the chat's own menu and choose **Move to folder**.
- **Multi-select**: long-press a chat inside a folder to start selecting, then move them all at once. AI Studio's sidebar doesn't support multi-select yet.

## Nest, rename and color

<img src="/assets/folders-nested-en.png" alt="Folders nested three levels deep" width="240" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);"/>

- Folders go three levels deep: a top-level folder can hold two more levels of subfolders.
- Double-click a folder's name to rename it.
- Right-click a folder to pin, create a subfolder, rename or delete it, or pick one of 7 colors.

<img src="/assets/folders-menu-en.png" alt="A folder's right-click menu with its colors" width="254" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);"/>

The gear in the folder header switches the chat order (manual or recently opened) and sets the text size, folder spacing and subfolder indent; the popup's **Folder spacing** sets it too. On Mac Safari, you may need to refresh the page to see a change.

## Hide filed chats

Once a chat is in a folder, you can take it out of the main list so only active chats stay there.

- On Gemini and AI Studio, open the popup → **Folder Options** → **Hide archived conversations**. Each site keeps its own setting; on AI Studio it hides the rows of the Library table.
- On Gemini and AI Studio, the first time you file a chat, a card in the folder section offers to turn it on in one click. Choose **Not now** and it won't ask again.
- On the other sites, the switch is in the folders plugin's settings in the popup's **Plugins** area, off by default.
- Nothing is deleted: filed chats are always in their folders, and you can turn this off at any time.

## Import and export

<img src="/assets/folders-transfer-en.png" alt="Import and export folders" width="190" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);"/>

The folder icon in the folder header has **Import folders** and **Export folders**. Export saves a JSON file; import merges it with your existing folders, so what you've already sorted stays put.

## Cloud sync

Every site with folders can use [Cloud Sync](/en/guide/cloud-sync) to get the same folders on another computer. Each site's folders are stored and synced separately.

## Activity view

The bell in the folder header swaps the tree for a read-only Activity view; press it again to get the tree back. It never moves, copies or re-files a chat.

- **Priority**: chats with real activity in the last 3 hours. Opening or viewing a chat doesn't count.
- **Today, Yesterday and weekdays**: ordered by the last real activity, keeping only today and the four days before it.
- Star is a separate manual mark and doesn't decide what goes into Priority.
- Older chats, or ones with no known time, stay out of Activity and remain in their folders.
- Each entry shows its folder path; a chat in several folders appears once.

[Read the full Activity view guide](/en/guide/activity-view)

## Account isolation

The person button in Gemini's sidebar temporarily shows only the current Google account's chats; it's off by default. **Enable Hard Isolation** in the popup's **Folder Options** splits folders and cloud sync data by account; once it's on, the data is already separate and the person button hides itself.

<img src="/assets/current-user-only.png" alt="The person button" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-width: 200px;"/>

## AI Organize

Too many chats to sort by hand? Let Gemini suggest a folder plan.

1. Open the popup on Gemini and click **AI Organize** at the bottom of **Folder Options**. It writes your unfiled chats and current folder structure into a prompt and copies it. The prompt uses your language, and so do the folder names.
2. Paste the prompt into Gemini. It replies with a folder plan in JSON.
3. Click **Import folders** in the folder header, choose **Or paste JSON directly**, paste, and click **Import**. **Merge with existing folders** is the default: it only adds new folders and new filings, and leaves your existing ones alone.

<img src="/assets/ai-auto-folder.png" alt="The AI Organize button in the popup" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-width: 320px;"/>

## Folders as projects

Give a folder first-turn instructions, and a new chat files itself there after its first message. The idea comes from Claude Projects, but Voyager only adds first-turn instructions and auto-filing; it isn't a shared-context workspace.

1. Turn on **Enable Folder as Project** in the popup.
2. Right-click a folder and choose **Set Instructions** or **Edit Instructions**.
3. Start a new Gemini chat and pick the folder in the folder picker next to the input box.
4. Send your first message.

What happens next:

- After the first send, the chat is filed into that folder.
- If the folder has instructions, Voyager adds them only to that first send. Without instructions, the folder is a quick way to file new chats.
- Chats in the same folder do **not** share memory or read each other.
- Draft autosave keeps only what you typed, never the hidden instructions.

For the sidebar's width, see [Sidebar Width](/en/guide/sidebar).
