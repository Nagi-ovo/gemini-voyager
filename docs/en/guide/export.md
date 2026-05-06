# Total Freedom

Voyager Export lets you download any Google Gemini conversation as a Markdown, PDF, or JSON file. It extracts the full chat content — including code blocks, images, and formatting — giving you a permanent, portable copy of every AI conversation you have.

Data lock-in is the enemy.
We believe that if you create it, you own it.

## Format Comparison

| Feature     | Markdown                     | PDF                  | JSON                      |
| ----------- | ---------------------------- | -------------------- | ------------------------- |
| Best for    | Note apps (Obsidian, Notion) | Sharing and printing | Developers, data analysis |
| Images      | Embedded (except Safari)     | Fully included       | Base64 encoded            |
| Code blocks | Preserved with syntax        | Rendered visually    | Raw text preserved        |
| File size   | Smallest                     | Largest              | Medium                    |
| Searchable  | Plain text                   | PDF reader search    | Programmatic access       |

## Export Everything

Voyager lets you pull your data out of the cloud and into your hands.

### The Formats

- **Markdown**: For your Obsidian vault or Notion. Clean, formatted text. (Safari Users: Images cannot be extracted due to browser limitations, use PDF export for images)
- **PDF**: For sharing or printing. Beautifully laid out, images included.
- **JSON**: Raw data. For developers who want to build on top of their history.

### How to Export

1. Hover your mouse over the Gemini logo to see the **Export Icon**.
2. Choose your format.
3. Done.

It’s your data. Do what you want with it.

<div style="display: flex; gap: 20px; margin-top: 20px;">
  <div style="flex: 1; text-align: center;">
    <p><b>Step 1: Hover Logo</b></p>
    <img src="/assets/gemini-export-guide-1.png" alt="Export guide step 1" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);"/>
  </div>
  <div style="flex: 1; text-align: center;">
    <p><b>Step 2: The Choice</b></p>
    <img src="/assets/gemini-export-guide-2.png" alt="Export guide step 2" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);"/>
  </div>
</div>

### Safari PDF Export Note

Exporting PDF on Safari requires a slightly different process (manual print):

1. Click the **Export** button and select PDF format.
2. **Wait for about a second** (allow the page to prepare print styles).
3. Press `Command + P` to open the print dialog.
4. Select **"Save to PDF"** in the print dialog.

<img src="/assets/safari-export-pdf.png" alt="Safari Export PDF" style="max-width: 100%; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); margin-top: 20px;"/>

## Deep Research Export

Gemini's Deep Research mode produces structured reports with sources, thinking steps, and citations. Voyager can export these sessions with all their metadata intact:

1. Open a completed Deep Research conversation.
2. Hover the Gemini logo and click the Export icon.
3. Choose Markdown or PDF.
4. The export includes the research question, thinking process, source links, and final report.

This is useful for academic research, competitive analysis, and technical documentation where you need to preserve the reasoning chain and source attribution.

## When to Export

- **Knowledge archiving**: Save important conversations before they get buried in your chat history.
- **Team sharing**: Export a debugging session as PDF to share with colleagues who don't use Gemini.
- **Building a knowledge base**: Export conversations in Markdown and organize them in Obsidian or Notion.
- **Data analysis**: Use JSON exports to programmatically analyze conversation patterns or extract structured data.
- **Compliance and auditing**: Keep records of AI-assisted decisions for audit trails.

## Supported Platforms

Export works on both Gemini and AI Studio across Chrome, Edge, Firefox, Safari, Opera, and Brave. Safari has specific limitations: images cannot be extracted in Markdown format (use PDF instead), and PDF export requires a manual print step (Command+P after clicking export).
