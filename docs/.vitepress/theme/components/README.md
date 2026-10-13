# SafariDownloadLink Component

This Vue component fetches the latest release version from GitHub and links to that release's page, where the Safari `.dmg` is attached.

## Usage

In any markdown file:

```markdown
Download the <SafariDownloadLink>latest Safari version</SafariDownloadLink>.
```

## How It Works

1. On mount, it reads a cached version from `localStorage` (kept for 10 minutes) or fetches the latest release from the GitHub API
2. Extracts the version number from the tag name
3. Links to `https://github.com/voyager-crew/voyager/releases/tag/v{version}`, or to `releases/latest` when the lookup fails
4. If the API call fails, it falls back to version `1.2.4`

## Features

- ✅ Automatic version detection
- ✅ Fallback to default version on error
- ✅ Loading state support
- ✅ Customizable link text via slot
- ✅ Works in all VitePress markdown files

## Example

```vue
<!-- Simple usage -->
<SafariDownloadLink>Download Safari Extension</SafariDownloadLink>

<!-- Custom styling (you can wrap it) -->
<SafariDownloadLink class="custom-link">Get the latest version</SafariDownloadLink>
```
