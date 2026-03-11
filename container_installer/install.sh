#!/bin/sh
set -e

rm -rf "/ogsh/container_files/*"
7z x "/ogsh/archive.7z" -y -o"/ogsh/container_files"