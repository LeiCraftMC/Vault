#!/bin/bash

TAG_NAME=$(curl -s "https://api.github.com/repos/dani-garcia/bw_web_builds/releases/latest" | grep '"tag_name":' | cut -d '"' -f 4)
DOWNLOAD_URL="https://github.com/dani-garcia/bw_web_builds/archive/refs/tags/$TAG_NAME.tar.gz"

curl -L -o "web-code-latest.tar.gz" "$DOWNLOAD_URL"

tar -xzf web-code-latest.tar.gz
rm web-code-latest.tar.gz
mv bw_web_builds-* web-build

rsync -av web/ web-build/
