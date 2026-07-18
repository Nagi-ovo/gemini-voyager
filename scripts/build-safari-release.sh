#!/bin/zsh

set -euo pipefail

if (( $# != 2 )); then
  echo "Usage: $0 <tag> <output-directory>" >&2
  exit 64
fi

ROOT_DIR=${0:A:h:h}
TAG=$1
OUTPUT_DIR=${2:A}
PROJECT_PATH="$ROOT_DIR/Voyager/Voyager.xcodeproj"
PACKAGE_DIR="$ROOT_DIR/.build/sparkle-source-packages"
TEAM_ID=${APPLE_TEAM_ID:-PJM828YBFJ}
: "${VOYAGER_APP_PROFILE_NAME:?VOYAGER_APP_PROFILE_NAME is required}"
: "${VOYAGER_EXTENSION_PROFILE_NAME:?VOYAGER_EXTENSION_PROFILE_NAME is required}"

if [[ ! $TAG =~ '^v[0-9]+\.[0-9]+\.[0-9]+([-.][0-9A-Za-z.]+)?$' ]]; then
  echo "Invalid release tag: $TAG" >&2
  exit 64
fi

WORK_DIR=$(mktemp -d)
trap 'rm -rf "$WORK_DIR"' EXIT

ARCHIVE_PATH="$WORK_DIR/Voyager.xcarchive"
DERIVED_DATA_PATH="$WORK_DIR/DerivedData"
EXPORT_OPTIONS="$WORK_DIR/ExportOptions.plist"
EXPORT_DIR="$WORK_DIR/export"
APP_PATH="$EXPORT_DIR/Voyager.app"
NOTARY_ZIP="$WORK_DIR/Voyager.zip"
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

  local notary_status
  local submission_id
  notary_status=$(plutil -extract status raw -o - "$result_file")
  submission_id=$(plutil -extract id raw -o - "$result_file")
  printf 'Notarization %s (submission %s)\n' "$notary_status" "$submission_id"

  if [[ $notary_status != Accepted ]]; then
    echo "Apple notarization rejected: $artifact" >&2
    exit 1
  fi
}

xcodebuild archive \
  -project "$PROJECT_PATH" \
  -scheme "Voyager" \
  -configuration Release \
  -destination "generic/platform=macOS" \
  -archivePath "$ARCHIVE_PATH" \
  -derivedDataPath "$DERIVED_DATA_PATH" \
  -clonedSourcePackagesDirPath "$PACKAGE_DIR" \
  CODE_SIGN_STYLE=Manual \
  CODE_SIGN_IDENTITY="Developer ID Application" \
  DEVELOPMENT_TEAM="$TEAM_ID" \
  "OTHER_SWIFT_FLAGS=-debug-prefix-map $ROOT_DIR=. -file-prefix-map $ROOT_DIR=." \
  "OTHER_CFLAGS=-fdebug-prefix-map=$ROOT_DIR=. -ffile-prefix-map=$ROOT_DIR=." \
  VOYAGER_APP_PROFILE_NAME="$VOYAGER_APP_PROFILE_NAME" \
  VOYAGER_EXTENSION_PROFILE_NAME="$VOYAGER_EXTENSION_PROFILE_NAME"

plutil -create xml1 "$EXPORT_OPTIONS"
plutil -insert destination -string export "$EXPORT_OPTIONS"
plutil -insert method -string developer-id "$EXPORT_OPTIONS"
plutil -insert signingCertificate -string "Developer ID Application" "$EXPORT_OPTIONS"
plutil -insert signingStyle -string manual "$EXPORT_OPTIONS"
plutil -insert teamID -string "$TEAM_ID" "$EXPORT_OPTIONS"
/usr/libexec/PlistBuddy -c 'Add :provisioningProfiles dict' "$EXPORT_OPTIONS"
/usr/libexec/PlistBuddy \
  -c "Add :provisioningProfiles:com.yourCompany.Gemini-Voyager string $VOYAGER_APP_PROFILE_NAME" \
  "$EXPORT_OPTIONS"
/usr/libexec/PlistBuddy \
  -c "Add :provisioningProfiles:com.yourCompany.Gemini-Voyager.Extension string $VOYAGER_EXTENSION_PROFILE_NAME" \
  "$EXPORT_OPTIONS"

xcodebuild -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportPath "$EXPORT_DIR" \
  -exportOptionsPlist "$EXPORT_OPTIONS"

if [[ ! -d $APP_PATH ]]; then
  echo "Archived app not found: $APP_PATH" >&2
  exit 1
fi

codesign --verify --deep --strict --verbose=2 "$APP_PATH"

APPEX_PATH=$(find "$APP_PATH/Contents/PlugIns" -maxdepth 1 -name '*.appex' -type d -print -quit)
if [[ -z $APPEX_PATH ]]; then
  echo "Safari web extension bundle was not exported" >&2
  exit 1
fi

APP_BUNDLE_ID=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$APP_PATH/Contents/Info.plist")
EXTENSION_BUNDLE_ID=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$APPEX_PATH/Contents/Info.plist")
if [[ $APP_BUNDLE_ID != com.yourCompany.Gemini-Voyager ]]; then
  echo "Unexpected app bundle identifier: $APP_BUNDLE_ID" >&2
  exit 1
fi
if [[ $EXTENSION_BUNDLE_ID != com.yourCompany.Gemini-Voyager.Extension ]]; then
  echo "Unexpected extension bundle identifier: $EXTENSION_BUNDLE_ID" >&2
  exit 1
fi

EXTENSION_ENTITLEMENTS="$WORK_DIR/extension-entitlements.plist"
codesign -d --entitlements :- "$APPEX_PATH" > "$EXTENSION_ENTITLEMENTS" 2>/dev/null
/usr/libexec/PlistBuddy \
  -c 'Print :com.apple.developer.icloud-container-identifiers:0' \
  "$EXTENSION_ENTITLEMENTS" | grep -qx 'iCloud.com.yourCompany.Gemini-Voyager'
/usr/libexec/PlistBuddy \
  -c 'Print :com.apple.developer.icloud-container-environment' \
  "$EXTENSION_ENTITLEMENTS" | grep -qx 'Production'

APP_EXECUTABLE="$APP_PATH/Contents/MacOS/Voyager"
ARCHITECTURES=" $(lipo -archs "$APP_EXECUTABLE") "
if [[ $ARCHITECTURES != *' arm64 '* || $ARCHITECTURES != *' x86_64 '* ]]; then
  echo "Safari release must be universal; found:$ARCHITECTURES" >&2
  exit 1
fi

ditto -c -k --keepParent "$APP_PATH" "$NOTARY_ZIP"
submit_for_notarization "$NOTARY_ZIP"
xcrun stapler staple "$APP_PATH"
xcrun stapler validate "$APP_PATH"

ditto "$APP_PATH" "$DMG_ROOT/Voyager.app"
ln -s /Applications "$DMG_ROOT/Applications"
cp "$ROOT_DIR/scripts/safari-dmg-readme.html" "$DMG_ROOT/READ ME — Safari Upgrade.html"
node "$ROOT_DIR/scripts/verify-release-privacy.mjs" "$DMG_ROOT"
hdiutil create \
  -volname "Voyager" \
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

node "$ROOT_DIR/scripts/verify-release-privacy.mjs" "$APP_PATH" "$DMG_PATH" "$APPCAST_PATH"

echo "Safari release artifacts:"
ls -lh "$DMG_PATH" "$APPCAST_PATH"
