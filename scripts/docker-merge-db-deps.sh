#!/bin/sh
set -e
src="/db-deps"
dest="/app/node_modules"
for pkg in "$src"/*; do
  name=$(basename "$pkg")
  rm -rf "$dest/$name"
  cp -r "$pkg" "$dest/$name"
done
