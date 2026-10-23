# ChatGPT Local Bridge

ChatGPT · Local Bridge is an official Voyager plugin. It's off by default.

Once you turn it on and pair, Voyager offers a set of ChatGPT page actions to local programs on this computer. A program says what it wants done, and Voyager does it in a tab of its own, using the ChatGPT you're already signed in to in your browser. To ChatGPT, it's an ordinary chat from your own browser.

## What it offers

- Open a conversation: a new one, or an existing one
- Pick the model: in chat mode only; it never switches ChatGPT to Work mode
- Send a prompt, with attachments
- Wait for the reply and read it
- Read the latest reply of an existing conversation
- List and create projects
- List, upload and remove project files (removal is immediate and permanent)
- Fetch the page data again now (the site data Voyager uses to recognize ChatGPT’s pages), instead of waiting for the next scheduled check

## How it behaves

**Local only.** The bridge talks to programs on this computer over `127.0.0.1` only, and only after pairing.

**Its own tab.** Each job runs in a ChatGPT tab Voyager opens, and the tab closes when it's done.

**One job at a time, unless you allow more.** Jobs run one after another by default. Turn on **Run jobs in parallel** in the popup's **Local bridge** card and set **Jobs at once** (2 to 10, 3 by default): each job gets its own tab, and typing and clicking still take turns. Parallel jobs need a Voyager CLI newer than 0.4.0; with an older `voyager serve`, jobs still run one at a time.

**Sign-ins and challenges are yours.** If ChatGPT asks you to sign in or solve a challenge, the bridge stops and says so. It never works around it.

**Your plan, named.** Every result names your ChatGPT plan (`Pro Lite ($100)`, `Pro ($200)`, …) as the page last reported it.

**Browsers.** Tested in Chrome. Edge and Firefox builds of Voyager include the bridge too; Safari does not.

## Reference usage: Voyager CLI

[Voyager CLI](https://github.com/voyager-crew/voyager-cli) (npm `@voyager-crew/cli`, command `voyager`) is a reference client built on these actions: ask ChatGPT from your terminal, or let your coding agent do it.

### Three steps

1. Install the CLI (Node.js 20.3 or later):

   ```sh
   npm install -g @voyager-crew/cli
   ```

2. In the Voyager popup, open **Plugins**, turn on **ChatGPT · Local Bridge** and allow access to chatgpt.com.
3. Pair them once:

   ```sh
   voyager pair
   ```

   Enter the eight-character code it prints in the Local bridge settings in the popup.

### A few examples

```sh
voyager ask "Explain this stack trace" --attach crash.log
voyager ask --chat <link|id> "And the edge cases?"  # follow up in a conversation
voyager read <link|id>                              # save a conversation's latest reply
voyager project upload "Thesis" ./thesis            # every chat in the project can read it
voyager ask --project "Thesis" "Where is the argument weakest?"
voyager ask --drive ./paper.pdf "Summarize the methods"  # put it on Google Drive for ChatGPT's own Drive app
voyager ask --repo owner/name "Why is CI failing?"       # ChatGPT's own GitHub app reads the repository
```

The reply is saved as `response.md`, and asks use GPT-6 Pro in chat mode by default.

Both use ChatGPT's own Google Drive and GitHub apps, so connect them in ChatGPT first; they only add text to the prompt and need no new Voyager version. `--drive` uploads with rclone into a new folder under `VOYAGER_DRIVE_REMOTE` (for example `gdrive:Voyager`), which must be the same Google account as ChatGPT's Drive app; it has no 64 MiB limit like `--attach`, and the files stay on Drive. `--repo` asks ChatGPT to commit only to a new `chatgpt/*` branch, but that is a request, not a restriction: the app can write wherever its GitHub installation reaches. If ChatGPT cannot reach the repository, voyager stops with exit code 3; add the repository in [GitHub's installation settings](https://github.com/settings/installations).

For waiting on long answers, what each exit code means and every command, see the [CLI README](https://github.com/voyager-crew/voyager-cli#readme). Instructions for Claude Code, Codex and other agents are in [SKILL.md](https://github.com/voyager-crew/voyager-cli/blob/main/skills/voyager/SKILL.md).

## Disclaimer

- Voyager and Voyager CLI are community open-source projects. They are not affiliated with or endorsed by OpenAI.
- The bridge automates ChatGPT on the web in your own signed-in browser. OpenAI's [Terms of Use](https://openai.com/policies/terms-of-use/) restrict extracting output by automated or programmatic means, so decide for yourself whether your use complies before you rely on it. Any limits placed on your account as a result are your own risk.
- Similar tools take the same line: [oracle](https://github.com/steipete/oracle), for example, makes its browser mode an opt-in experimental feature and points people who want to avoid the risk to the API. If you need a supported route, use the OpenAI API.
- The bridge is for your own convenience on your own computer: connect only your own account, do not use it to serve other people, share an account or resell usage, and use it only for lawful purposes.
