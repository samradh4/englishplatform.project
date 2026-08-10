#!/bin/zsh
set -e
SCRIPT_DIR="${0:A:h}"
TARGET_DIR="$SCRIPT_DIR/public/assets/fonts"
TARGET="$TARGET_DIR/poppins.extrabold.ttf"
mkdir -p "$TARGET_DIR"

CANDIDATES=(
  "$HOME/Downloads/poppins.extrabold.ttf"
  "$HOME/Desktop/poppins.extrabold.ttf"
  "$HOME/Documents/poppins.extrabold.ttf"
)

for FONT in "${CANDIDATES[@]}"; do
  if [[ -f "$FONT" ]]; then
    cp "$FONT" "$TARGET"
    echo "Poppins ExtraBold installed successfully."
    echo "Saved to: $TARGET"
    read "?Press Enter to close..."
    exit 0
  fi
done

echo "Could not find poppins.extrabold.ttf automatically."
echo "Drag the font file into this Terminal window, then press Enter:"
read FONT_PATH
FONT_PATH="${FONT_PATH//\\ / }"
FONT_PATH="${FONT_PATH#\'}"
FONT_PATH="${FONT_PATH%\'}"
FONT_PATH="${FONT_PATH#\"}"
FONT_PATH="${FONT_PATH%\"}"

if [[ ! -f "$FONT_PATH" ]]; then
  echo "File not found: $FONT_PATH"
  read "?Press Enter to close..."
  exit 1
fi

cp "$FONT_PATH" "$TARGET"
echo "Poppins ExtraBold installed successfully."
echo "Saved to: $TARGET"
read "?Press Enter to close..."
