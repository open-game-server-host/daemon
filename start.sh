#!/bin/bash
set -e

BASE_PATH="$(realpath .)"
printf "INFO  Working directory '$BASE_PATH'\n"

BRANCH=$1
if [ -z "$BRANCH" ]; then
    BRANCH="main"
fi

USER="$(whoami)"
printf "INFO  Running as user '$USER'\n"

API_KEY_PATH="$BASE_PATH/api_key"
if [ ! -f "$API_KEY_PATH" ]; then
    printf "ERROR Api key not found! ($API_KEY_PATH)\n"
    exit 1
fi

DOCKER_SOCK_PATH="$BASE_PATH/docker.sock"
if [ -S "$DOCKER_SOCK_PATH" ]; then
    printf "INFO  Using docker socket at '$DOCKER_SOCK_PATH'\n"
elif [ -S "/var/run/docker.sock" ]; then
    DOCKER_SOCK_PATH="/var/run/docker.sock"
    printf "INFO  Using docker socket at '$DOCKER_SOCK_PATH'\n"
else
    if [ "$DOCKER_SOCK_PATH" = "/var/run/docker.sock" ]; then
        printf "ERROR Could not find docker socket at '$DOCKER_SOCK_PATH'!\n"
    else
        printf "ERROR Could not find docker socket at '$DOCKER_SOCK_PATH' or '/var/run/docker.sock'!\n"
    fi
    exit 1
fi

CONTAINER_FILES_PATH="$BASE_PATH/container_files"
mkdir -p "$CONTAINER_FILES_PATH"

APP_ARCHIVES_PATH="$BASE_PATH/app_archives"
mkdir -p "$APP_ARCHIVES_PATH"

STARTUP_FILES_PATH="$BASE_PATH/startup_files"
mkdir -p "$STARTUP_FILES_PATH"

CONTAINER_NAME="ogsh_daemon"
CONTAINER_TAG="ghcr.io/open-game-server-host/daemon:$BRANCH"
printf "INFO  Pulling container image '$CONTAINER_TAG'\n"
docker pull "$CONTAINER_TAG"
docker rm -f $CONTAINER_NAME
docker run -d -u $(id -u "$USER"):$(getent group docker | cut -d: -f3) --read-only --cpus=1 --memory=500m -v $API_KEY_PATH:/ogsh/api_key -v $DOCKER_SOCK_PATH:/var/run/docker.sock -v "$CONTAINER_FILES_PATH":/ogsh/container_files -v "$APP_ARCHIVES_PATH":/ogsh/app_archives -v "$STARTUP_FILES_PATH":/ogsh/startup_files --name $CONTAINER_NAME $CONTAINER_TAG
printf "INFO  Started container '$CONTAINER_NAME'\n"