#!/bin/zsh

set -euo pipefail

if (( $# < 2 || $# > 3 )); then
  echo "Usage: $0 <notarized-update-archive> <tag> [output-appcast]" >&2
  exit 64
fi

ROOT_DIR=${0:A:h:h}
ARCHIVE_PATH=${1:A}
TAG=$2
OUTPUT_PATH=${3:-$ROOT_DIR/appcast.xml}
PACKAGE_DIR=${SPARKLE_PACKAGE_DIR:-$ROOT_DIR/.build/sparkle-source-packages}
GENERATE_APPCAST=$PACKAGE_DIR/artifacts/sparkle/Sparkle/bin/generate_appcast
DERIVE_PUBLIC_KEY=$ROOT_DIR/scripts/derive-sparkle-public-key.swift
INFO_PLIST=$ROOT_DIR/Gemini\ Voyager/Gemini\ Voyager/Info.plist

if [[ ! -f $GENERATE_APPCAST ]]; then
  xcodebuild -resolvePackageDependencies \
    -project "$ROOT_DIR/Gemini Voyager/Gemini Voyager.xcodeproj" \
    -clonedSourcePackagesDirPath "$PACKAGE_DIR"
fi

WORK_DIR=$(mktemp -d)
trap 'rm -rf "$WORK_DIR"' EXIT
cp "$ARCHIVE_PATH" "$WORK_DIR/"

DOWNLOAD_PREFIX="https://github.com/Nagi-ovo/voyager/releases/download/$TAG/"
COMMON_ARGS=(
  --download-url-prefix "$DOWNLOAD_PREFIX"
  --link "https://github.com/Nagi-ovo/voyager"
  -o "$OUTPUT_PATH"
  "$WORK_DIR"
)

if [[ -n ${SPARKLE_PRIVATE_KEY:-} ]]; then
  EXPECTED_PUBLIC_KEY=$(plutil -extract SUPublicEDKey raw -o - "$INFO_PLIST")
  DERIVED_PUBLIC_KEY=$(print -rn -- "$SPARKLE_PRIVATE_KEY" | xcrun swift "$DERIVE_PUBLIC_KEY")
  if [[ $DERIVED_PUBLIC_KEY != $EXPECTED_PUBLIC_KEY ]]; then
    echo "SPARKLE_PRIVATE_KEY does not match SUPublicEDKey" >&2
    exit 1
  fi

  print -rn -- "$SPARKLE_PRIVATE_KEY" | "$GENERATE_APPCAST" --ed-key-file - "${COMMON_ARGS[@]}"
else
  "$GENERATE_APPCAST" --account "${SPARKLE_KEY_ACCOUNT:-Nagi-ovo}" "${COMMON_ARGS[@]}"
fi

if ! grep -q 'sparkle:edSignature=' "$OUTPUT_PATH"; then
  echo "Sparkle signature is missing from $OUTPUT_PATH" >&2
  exit 1
fi

echo "Generated $OUTPUT_PATH"
