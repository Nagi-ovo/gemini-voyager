# Context Sync: Transferring Memories (Experimental)

**Different Dimensions, Seamless Sharing**

Iterate logic on the web, and implement code in the IDE. Gemini Voyager breaks down the dimensional barriers, giving your IDE the "thinking process" of the web instantly.

## Say Goodbye to Constant Switching

The biggest pain for developers: after discussing a solution thoroughly on the web, you return to VS Code/Trae/Cursor only to have to re-explain the requirements like a stranger. Due to quotas and response speeds, the web is the "brain" and the IDE is the "hands." Voyager lets them share the same soul.

## Three Simple Steps to Synchronize

1. **Wake up CoBridge**: Install the **CoBridge** extension from the VS Code Marketplace and start it. It's the bridge connecting the web and your local machine.
   ![CoBridge Extension](/assets/CoBridge-extension.png)

   ![CoBridge Server On](/assets/CoBridge-on.png)

2. **Handshake Connection**:
   - Enable "Context Sync" in Voyager settings.
   - Align the port numbers. When you see "IDE Online," they are connected.

   ![Context Sync Console](/assets/context-sync-console.png)

3. **One-Click Sync**: Click **"Sync to IDE"**.

   ![Sync Done](/assets/sync-done.png)

## Rooting in the IDE

After synchronization, a `.vscode/AI_CONTEXT_SYNC.md` file will appear in your IDE's root directory. Whether it's Trae, Cursor, or Copilot, they will automatically read this "memory" through their respective rule files. **AI models will no longer suffer from memory loss, hitting the ground running.**

## Principles

- **Zero Pollution**: CoBridge automatically handles `.gitignore`, ensuring your private conversations are never pushed to Git repositories.
- **Industry Savvy**: Full Markdown format, making it as smooth for the AI in your IDE to read as an instruction manual.
- **Pro Tip**: If the conversation is from a while ago, scroll up using the [Timeline] first to let the web "remember" the context for better sync results.
