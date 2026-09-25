#!/bin/zsh
# マニュアル用の書体を作る（Noto Sans JP・Inter。どちらも OFL）。fonttools が要る（pyftsubset・fonttools コマンド）
# 可変フォントから太さ 400・700 の固定版を取り出し、manual.html の文字だけに切り出す（PDF が軽く、Type 3 にならない）
set -e
cd "$(dirname "$0")"
F=../../_fonts
mkdir -p fonts
for w in 400 700; do
  fonttools varLib.instancer $F/NotoSansJP-wght.ttf wght=$w -o fonts/noto-$w-full.ttf -q
  pyftsubset fonts/noto-$w-full.ttf --text-file=manual.html --unicodes="U+0020-007E,U+3000-303F,U+FF01-FF5E" --layout-features='*' --output-file=fonts/noto-$w.ttf
  fonttools varLib.instancer $F/Inter-latin-wght.woff2 wght=$w -o fonts/inter-$w-full.ttf -q
  pyftsubset fonts/inter-$w-full.ttf --unicodes="U+0020-007E" --layout-features='*' --output-file=fonts/inter-$w.ttf
  rm fonts/noto-$w-full.ttf fonts/inter-$w-full.ttf
done
ls -la fonts
