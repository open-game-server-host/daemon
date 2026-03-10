#!/bin/sh

set -e

rm -rf "$CONTAINER_FILES_PATH/*"
7z x "$ARCHIVE_PATH" -bso0 -bsp0 -o"$CONTAINER_FILES_PATH"