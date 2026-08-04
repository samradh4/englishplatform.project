#!/bin/bash
set -e
cd "$(dirname "$0")"
mkdir -p public/assets/fonts

candidates=(
  "$HOME/Downloads/poppins.extrabold.ttf"
  "$HOME/Downloads/Poppins-ExtraBold.ttf"
  "$(dirname "$0")/poppins.extrabold.ttf"
  "$(dirname "$0")/Poppins-ExtraBold.ttf"
)

for font in "${candidates[@]}"; do
  if [ -f "$font" ]; then
    cp "$font" public/assets/fonts/poppins.extrabold.ttf
    echo "Poppins ExtraBold added to the website."
    echo "Now restart the server and hard-refresh Chrome with Command + Shift + R."
    read -r -p "Press Enter to close..."
    exit 0
  fi
done

echo "Font file not found."
echo "Place poppins.extrabold.ttf in your Downloads folder or next to this script, then run it again."
read -r -p "Press Enter to close..."
exit 1
