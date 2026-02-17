#!/bin/bash

# Build Safari Extension
# This script builds the extension for Safari using xcrun safari-web-extension-converter

set -e

echo "🔨 Building extension for Safari..."

# Step 1: Build the extension using Vite
echo "📦 Building with Vite..."
npm run build:safari

# Step 2: Check if dist_safari exists
if [ ! -d "dist_safari" ]; then
  echo "❌ Error: dist_safari directory not found"
  exit 1
fi

echo "✅ Build completed: dist_safari/"

# Step 3: Convert to Safari App Extension (requires macOS)
if [[ "$OSTYPE" == "darwin"* ]]; then
  echo ""
  echo "🍎 Safari Extension Converter Information:"
  echo ""
  echo "To convert this extension for Safari, run:"
  echo ""
  echo "  xcrun safari-web-extension-converter dist_safari --app-name 'Gemini Voyager' --bundle-identifier com.nagi-ovo.Gemini-Voyager"
  echo ""
  echo "This will create a Safari App Extension project that you can:"
  echo "  1. Open in Xcode"
  echo "  2. Sign with your Apple Developer ID"
  echo "  3. Build and run on Safari"
  echo ""
  echo "Note: You need:"
  echo "  - macOS 11 (Big Sur) or later"
  echo "  - Xcode 12 or later"
  echo "  - Safari 14 or later"
  echo ""
  echo "For development testing without Xcode:"
  echo "  xcrun safari-web-extension-converter dist_safari --macos-only"
  echo ""
else
  echo ""
  echo "⚠️  Safari extension conversion requires macOS with Xcode"
  echo "The built extension is available in: dist_safari/"
  echo ""
fi

echo "✨ Done!"

