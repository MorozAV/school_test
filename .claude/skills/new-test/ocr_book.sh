#!/usr/bin/env bash
# OCR a whole PDF textbook into one text file with page markers.
# usage: ocr_book.sh <pdf> <out.txt> <workdir> <printed-page offset>
set -euo pipefail
PDF="$1"; OUT="$2"; WORK="$3"; OFF="$4"
T="/c/Program Files/Tesseract-OCR/tesseract.exe"
mkdir -p "$WORK"
N=$(pdfinfo "$PDF" | awk '/^Pages:/{print $2}')

ocr_page(){
  p="$1"
  pdftoppm -f "$p" -l "$p" -r 300 -gray -png -singlefile "$PDF" "$WORK/p$p"
  "$T" --tessdata-dir "C:/Users/alexfess/tessdata" "$WORK/p$p.png" "$WORK/p$p" -l rus >/dev/null 2>&1
  rm -f "$WORK/p$p.png"
}
export -f ocr_page; export PDF WORK T

seq 1 "$N" | xargs -P 4 -I{} bash -c 'ocr_page {}'

: > "$OUT"
for p in $(seq 1 "$N"); do
  printf '\n===== стр. PDF %d · печатная %d =====\n' "$p" $((p + OFF)) >> "$OUT"
  cat "$WORK/p$p.txt" >> "$OUT"
done
node "$(dirname "$0")/fix_roman.js" "$OUT" | head -1
echo "done: $N pages -> $OUT"
