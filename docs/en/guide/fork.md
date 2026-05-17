# Conversation Fork (Experimental)

Thinking shouldn't be a one-way street. In complex explorations, we often need to return to a crucial node and try different possibilities.

With the **Conversation Fork** feature, Voyager allows you to branch out your thoughts and explore parallel universes of your chat.

## How it Works

> **⚠️ Note**: This is an experimental feature. You need to enable it first by clicking the extension icon in your browser toolbar to open the settings popup, and turning on the **Enable Conversation Fork** switch.

Whenever you want to take a different path, simply hover over your prompt and click the **Fork** button:

![Conversation Fork](/assets/branching.png)

Voyager captures the full context from the beginning up to that point and shows a confirmation dialog. Choose based on context length:

- **Download MD** (recommended for most conversations): Gemini's input field has length limits, so longer context may not fit if pasted directly. Voyager downloads a Markdown context file and opens a new conversation; drag the `.md` file into Gemini before the bottom-right 2-minute countdown ends. The input is prefilled with a short note that the attachment is context from the previous conversation, leaving **New request:** for your next message.
- **Fork** (best for short conversations): when the context is short, Voyager opens a new conversation and fills the input directly; send it to create the branch.

After you send, Voyager only records the branch relationship. It does not delete or rewrite your original conversation.

In this new branch, you can freely modify your question and explore different directions without worrying about destroying your original chat history. Unleash your creativity and curiosity!
