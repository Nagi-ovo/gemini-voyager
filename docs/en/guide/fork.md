# Conversation Fork (Experimental)

Thinking shouldn't be a one-way street. In complex explorations, we often need to return to a crucial node and try different possibilities.

With the **Conversation Fork** feature, Voyager allows you to branch out your thoughts and explore parallel universes of your chat.

## How it Works

> **⚠️ Note**: This is an experimental feature. You need to enable it first by clicking the extension icon in your browser toolbar to open the settings popup, and turning on the **Enable Conversation Fork** switch.

Whenever you want to take a different path, simply hover over your prompt and click the **Fork** button:

![Conversation Fork](/assets/branching.png)

Voyager captures the full context from the beginning up to that point and shows a confirmation dialog:

- Click **Fork**: Voyager opens a new conversation and automatically fills the input with the captured context. Review it, send it, and the new chat becomes the branch.
- Click **Download MD**: Voyager downloads a Markdown context file and opens a new conversation. Before the bottom-right countdown expires (within 2 minutes), drag the `.md` file into Gemini's input area. The input is prefilled with a small template that says the attachment is context from the previous conversation and leaves **New request:** for your next message. Send it to record the new chat as this branch.

Because Gemini's file attachment flow cannot be reliably automated by the extension, MD mode requires you to drag the file manually. The countdown hint shows the remaining time; after it expires, that fork link is no longer created.

Voyager only records the branch relationship. It does not delete or rewrite your original conversation.

In this new branch, you can freely modify your question and explore different directions without worrying about destroying your original chat history. Unleash your creativity and curiosity!
