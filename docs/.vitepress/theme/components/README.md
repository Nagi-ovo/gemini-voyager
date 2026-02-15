# SafariDownloadLink Component

This Vue component automatically fetches the latest release version from GitHub and generates the correct Safari download URL.

## Usage

In any markdown file:

```markdown
Download the <SafariDownloadLink>latest Safari version</SafariDownloadLink>.
```

## How It Works

1. On component mount, it fetches the latest release from GitHub API
2. Extracts the version number from the tag name
3. Generates the download URL: `https://github.com/Nagi-ovo/gemini-voyager/releases/download/v{version}/gemini-voyager-v{version}.dmg`
4. If the API call fails, it falls back to version `1.2.3`

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
