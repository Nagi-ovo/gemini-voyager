# Folders Done Right

Why is organizing AI chats so hard?
We fixed it. We built a file system for your thoughts.

<div style="display: flex; gap: 20px; margin-top: 20px; flex-wrap: wrap; margin-bottom: 40px;">
  <div style="flex: 1; min-width: 300px; text-align: center;">
    <p><b>Gemini™</b></p>
    <img src="/assets/gemini-folders.png" alt="Gemini Folders" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);"/>
  </div>
  <div style="flex: 1; min-width: 300px; text-align: center;">
    <p><b>AI Studio</b></p>
    <img src="/assets/aistudio-folders.png" alt="AI Studio Folders" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);"/>
  </div>
</div>

## The Physics of Organization

It just feels right.

- **Drag and Drop**: Pick up a chat. Drop it in a folder. It’s tactile.
- **Nested Hierarchy**: Projects have sub-projects. Create folders inside folders. Structure it _your_ way.
- **Folder Spacing**: Adjust vertical density from compact to spacious.
  > _Note: On Mac Safari, adjustments may not be real-time; refresh the page to see the effect._
- **Instant Sync**: Organize on your desktop. See it on your laptop.

## Pro Tips

- **Multi-Select**: Long-press a conversation to enter multi-select mode, then select multiple chats and move them all at once.
- **Renaming**: Double-click any folder to rename it.
- **Icons**: We automatically detect the Gem type (Coding, Creative, etc.) and assign the right icon. You don't have to do a thing.

## Platform Feature Differences

### Common Features

- **Basic Management**: Drag and drop, rename, multi-select.
- **Smart Recognition**: Automatically detect chat types and assign icons.
- **Nested Hierarchy**: Support for folder nesting.
- **AI Studio Adaptive**: Advanced features coming soon to AI Studio.
- **Google Drive Sync**: Sync folder structure to Google Drive.

### Gemini Exclusive

#### Custom Colors

Click the folder icon to customize its color. Choose from 7 default colors or use the color picker to select any custom color.

<img src="/assets/folder-color.png" alt="Folder Colors" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); margin-top: 10px; max-width: 600px;"/>

#### Account Isolation

Click the "person" icon in the header to instantly filter out chats from other Google accounts. Keep your workspace clean when using multiple accounts.

<img src="/assets/current-user-only.png" alt="Account Isolation" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); margin-top: 10px; max-width: 600px;"/>

#### AI Auto-Organize

Too many chats, too lazy to sort? Let Gemini do the thinking.

One click copies your current conversation structure, paste it into Gemini, and it generates a ready-to-import folder plan — instant organization.

**Step 1: Copy Your Conversation Structure**

At the bottom of the folder section in the extension popup, click the **AI Organize** button. It automatically collects all your unfiled conversations and existing folder structure, generates a prompt, and copies it to your clipboard.

<img src="/assets/ai-auto-folder.png" alt="AI Organize Button" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-width: 400px;"/>

**Step 2: Let Gemini Sort It Out**

Paste the clipboard content into a Gemini conversation. It will analyze your chat titles and output a JSON folder plan.

**Step 3: Import the Results**

Click **Import folders** from the folder panel menu, select **Or paste JSON directly**, paste the JSON that Gemini returned, and click **Import**.

<div style="display: flex; gap: 16px; margin-top: 12px; flex-wrap: wrap; margin-bottom: 24px;">
  <div style="text-align: center;">
    <img src="/assets/ai-auto-folder-2.png" alt="Import Menu" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-width: 240px;"/>
  </div>
  <div style="text-align: center;">
    <img src="/assets/ai-auto-folder-3.png" alt="Paste JSON Import" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-width: 400px;"/>
  </div>
</div>

- **Incremental Merge**: Uses the "Merge" strategy by default — only adds new folders and assignments, never destroys your existing organization.
- **Multilingual**: The prompt automatically uses your configured language, and folder names are generated in that language too.

### AI Studio Exclusive

- **Sidebar Adjustment**: Drag to resize the sidebar width.
- **Library Integration**: Drag directly from your Library into folders.
