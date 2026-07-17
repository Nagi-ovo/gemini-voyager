#!/bin/zsh

set -euo pipefail

if (( $# != 2 )); then
  echo "Usage: $0 <tag> <output-directory>" >&2
  exit 64
fi

ROOT_DIR=${0:A:h:h}
TAG=$1
OUTPUT_DIR=${2:A}
PROJECT_PATH="$ROOT_DIR/Gemini Voyager/Gemini Voyager.xcodeproj"
PACKAGE_DIR="$ROOT_DIR/.build/sparkle-source-packages"
TEAM_ID=${APPLE_TEAM_ID:-PJM828YBFJ}

if [[ ! $TAG =~ '^v[0-9]+\.[0-9]+\.[0-9]+([-.][0-9A-Za-z.]+)?$' ]]; then
  echo "Invalid release tag: $TAG" >&2
  exit 64
fi

WORK_DIR=$(mktemp -d)
trap 'rm -rf "$WORK_DIR"' EXIT

ARCHIVE_PATH="$WORK_DIR/Gemini Voyager.xcarchive"
EXPORT_OPTIONS="$WORK_DIR/ExportOptions.plist"
EXPORT_DIR="$WORK_DIR/export"
APP_PATH="$EXPORT_DIR/Gemini Voyager.app"
NOTARY_ZIP="$WORK_DIR/Gemini Voyager.zip"
DMG_ROOT="$WORK_DIR/dmg"
DMG_PATH="$OUTPUT_DIR/voyager-$TAG.dmg"
APPCAST_PATH="$OUTPUT_DIR/appcast.xml"

mkdir -p "$OUTPUT_DIR" "$DMG_ROOT"
rm -f "$DMG_PATH" "$APPCAST_PATH"

submit_for_notarization() {
  local artifact=$1
  local result_file="$WORK_DIR/notary-$(basename "$artifact").json"

  if [[ -n ${NOTARY_KEYCHAIN_PROFILE:-} ]]; then
    xcrun notarytool submit "$artifact" \
      --keychain-profile "$NOTARY_KEYCHAIN_PROFILE" \
      --wait \
      --output-format json > "$result_file"
  else
    : "${APPLE_ID:?APPLE_ID is required when NOTARY_KEYCHAIN_PROFILE is unset}"
    : "${APPLE_APP_SPECIFIC_PASSWORD:?APPLE_APP_SPECIFIC_PASSWORD is required when NOTARY_KEYCHAIN_PROFILE is unset}"

    xcrun notarytool submit "$artifact" \
      --apple-id "$APPLE_ID" \
      --password "$APPLE_APP_SPECIFIC_PASSWORD" \
      --team-id "$TEAM_ID" \
      --wait \
      --output-format json > "$result_file"
  fi

  plutil -p "$result_file"

  if [[ $(plutil -extract status raw -o - "$result_file") != Accepted ]]; then
    echo "Apple notarization rejected: $artifact" >&2
    exit 1
  fi
}

xcodebuild archive \
  -project "$PROJECT_PATH" \
  -scheme "Gemini Voyager" \
  -configuration Release \
  -destination "generic/platform=macOS" \
  -archivePath "$ARCHIVE_PATH" \
  -clonedSourcePackagesDirPath "$PACKAGE_DIR" \
  CODE_SIGN_STYLE=Manual \
  CODE_SIGN_IDENTITY="Developer ID Application" \
  DEVELOPMENT_TEAM="$TEAM_ID"

plutil -create xml1 "$EXPORT_OPTIONS"
plutil -insert destination -string export "$EXPORT_OPTIONS"
plutil -insert method -string developer-id "$EXPORT_OPTIONS"
plutil -insert signingCertificate -string "Developer ID Application" "$EXPORT_OPTIONS"
plutil -insert signingStyle -string manual "$EXPORT_OPTIONS"
plutil -insert teamID -string "$TEAM_ID" "$EXPORT_OPTIONS"

xcodebuild -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportPath "$EXPORT_DIR" \
  -exportOptionsPlist "$EXPORT_OPTIONS"

if [[ ! -d $APP_PATH ]]; then
  echo "Archived app not found: $APP_PATH" >&2
  exit 1
fi

codesign --verify --deep --strict --verbose=2 "$APP_PATH"

APP_EXECUTABLE="$APP_PATH/Contents/MacOS/Gemini Voyager"
ARCHITECTURES=" $(lipo -archs "$APP_EXECUTABLE") "
if [[ $ARCHITECTURES != *' arm64 '* || $ARCHITECTURES != *' x86_64 '* ]]; then
  echo "Safari release must be universal; found:$ARCHITECTURES" >&2
  exit 1
fi

ditto -c -k --keepParent "$APP_PATH" "$NOTARY_ZIP"
submit_for_notarization "$NOTARY_ZIP"
xcrun stapler staple "$APP_PATH"
xcrun stapler validate "$APP_PATH"

ditto "$APP_PATH" "$DMG_ROOT/Gemini Voyager.app"
ln -s /Applications "$DMG_ROOT/Applications"
hdiutil create \
  -volname "Gemini Voyager" \
  -srcfolder "$DMG_ROOT" \
  -format UDZO \
  -ov \
  "$DMG_PATH"

submit_for_notarization "$DMG_PATH"
xcrun stapler staple "$DMG_PATH"
xcrun stapler validate "$DMG_PATH"
spctl --assess --type execute --verbose=4 "$APP_PATH"

SPARKLE_PACKAGE_DIR="$PACKAGE_DIR" \
  "$ROOT_DIR/scripts/generate-sparkle-appcast.sh" \
  "$DMG_PATH" \
  "$TAG" \
  "$APPCAST_PATH"

node "$ROOT_DIR/scripts/verify-release-privacy.mjs" "$DMG_PATH" "$APPCAST_PATH"

echo "Safari release artifacts:"
ls -lh "$DMG_PATH" "$APPCAST_PATH"
