# Folder Manager

This folder contains the implementation of the conversation folder management feature for Gemini Voyager.

## Overview

The folder manager allows users to:
- Create and manage folders and subfolders (2-level nesting)
- Drag and drop conversations from the sidebar into folders
- Move conversations between folders
- Display Gem-specific icons for different conversation types
- Navigate to conversations without page reload (SPA-style)

## File Structure

- **`types.ts`** - TypeScript type definitions for folders, conversations, and drag data
- **`manager.ts`** - Core folder management logic and UI rendering
- **`gemConfig.ts`** - Configuration for Gem icons and metadata
- **`index.ts`** - Entry point that initializes the folder manager
- **`README.md`** - This file

## Adding Support for New Gems

To add support for a new Gem (either official Google Gems or custom Gems):

1. Open `gemConfig.ts`
2. Add a new entry to the `GEM_CONFIG` array:

```typescript
{
  id: 'your-gem-id',           // The ID as it appears in URLs (/gem/your-gem-id/...)
  name: 'Your Gem Name',       // Display name
  icon: 'material_icon_name',  // Google Material Symbols icon name
}
```

### Finding the Gem ID

The Gem ID is the URL slug used by Gemini:
- Open a conversation with the Gem
- Check the URL: `https://gemini.google.com/app/gem/[GEM_ID]/...`
- Use this ID in the configuration

### Choosing an Icon

Icons should be valid [Google Material Symbols](https://fonts.google.com/icons) icon names. Common examples:
- `auto_stories` - Learning Coach
- `lightbulb` - Brainstorm Buddy
- `work` - Career Guide
- `code` - Coding Partner
- `edit_note` - Writing Editor
- `menu_book` - Storybook
- `chess` - Chess Champ
- `check_circle` - Productivity Helper
- `sports_cricket` - Cricket

### Example

```typescript
export const GEM_CONFIG: GemConfig[] = [
  // ... existing entries ...
  {
    id: 'data-analyst',
    name: 'Data Analyst',
    icon: 'analytics',
  },
];
```

## Contributing

If you're adding support for a new official Google Gem, please submit a pull request with:
1. The new entry in `gemConfig.ts`
2. A brief description of the Gem in your PR

## Technical Details

### Gem Detection

The folder manager detects Gem conversations by analyzing the `jslog` attribute:
- **Regular conversations**: `BardVeMetadataKey:[...,[id,null,0,1]]` (4 elements)
- **Gem conversations**: `BardVeMetadataKey:[...,[id,null,0]]` (3 elements)

### URL Generation

- Regular conversations: `/app/{hex-id}`
- Gem conversations: `/gem/{gem-id}/{hex-id}`
- Multi-account support: `/u/{account-number}/...`

### Icon Mapping

The system uses a two-way mapping:
- **Gem ID → Icon**: Used when rendering conversations in folders
- **Icon → Gem ID**: Used when detecting Gem type from DOM elements

## Future Enhancements

Potential improvements that could be contributed:
- Custom user-defined Gems
- Gem icon customization
- Support for more than 2 levels of folder nesting
- Import/export folder structure
- Folder sharing across devices
