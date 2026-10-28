#!/usr/bin/env bash
# Builds the game into a single self-contained HTML file (Cluckles.html) that
# runs by double-clicking it, with no server or install needed.
#
# Vite splits the bundle into chunks, so we build with one JS chunk and then
# inline the JS and CSS straight into the HTML.
set -euo pipefail

cd "$(dirname "$0")/.."

OUT_DIR="dist-single"
CONFIG="vite.build-single.config.mjs"

cleanup() {
  rm -f "$CONFIG"
  rm -rf "$OUT_DIR"
}
trap cleanup EXIT

cat > "$CONFIG" <<EOF
export default {
  configFile: false,
  base: './',
  logLevel: 'warn',
  build: {
    target: 'es2022',
    outDir: '$OUT_DIR',
    emptyOutDir: true,
    modulePreload: false,
    rollupOptions: {
      input: { main: 'index.html' },
      output: { codeSplitting: false },
    },
  },
};
EOF

npx vite build --config "$CONFIG"

shopt -s nullglob
css_files=("$OUT_DIR"/assets/main-*.css)
js_files=("$OUT_DIR"/assets/main-*.js)
shopt -u nullglob

if [ "${#css_files[@]}" -ne 1 ] || [ "${#js_files[@]}" -ne 1 ]; then
  echo "Expected one main CSS and JS bundle in $OUT_DIR/assets" >&2
  exit 1
fi

# Inline the CSS and JS into index.html. The bundle is passed through
# environment variables so its contents are never parsed as code or as
# regex replacement patterns.
OUT_DIR="$OUT_DIR" perl -0777 -e '
  use strict;
  use warnings;
  my $dir = $ENV{OUT_DIR};
  my ($css_path) = glob("$dir/assets/main-*.css");
  my ($js_path)  = glob("$dir/assets/main-*.js");
  my $read = sub { open my $fh, "<", $_[0] or die "$_[0]: $!"; local $/; my $c = <$fh>; close $fh; $c };
  my $css  = $read->($css_path);
  my $js   = $read->($js_path);
  my $html = $read->("$dir/index.html");

  $html =~ s{<link rel="modulepreload"[^>]*>\n?}{}g;
  $html =~ s{<link rel="stylesheet"[^>]*>}{<style>$css</style>};
  $html =~ s{<script type="module"[^>]*></script>}{};
  $html =~ s{</body>}{<script type="module">$js</script>\n</body>};

  open my $out, ">", "Cluckles.html" or die "Cluckles.html: $!";
  binmode $out;
  print $out $html;
  close $out;
  printf "Wrote Cluckles.html (%d KB)\n", int((length($html) + 1023) / 1024);
'
