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

printf "INFO  Checking for new start script\n"
START_SCRIPT_PATH="$BASE_PATH/start.sh"
START_SCRIPT_URL="https://raw.githubusercontent.com/open-game-server-host/daemon/refs/heads/$BRANCH/start.sh"
NEW_START_SCRIPT="$(curl $START_SCRIPT_URL)"
if [ "$(cat $START_SCRIPT_PATH)" = "$NEW_START_SCRIPT" ]; then
    printf "INFO  This is the latest version\n"
else
    printf "INFO  Restarting to update\n"
    sleep 3
    NEW_START_SCRIPT_PATH="$BASE_PATH/start.sh.update"
    printf "$NEW_START_SCRIPT" > "$NEW_START_SCRIPT_PATH"
    cp "$NEW_START_SCRIPT_PATH" "$START_SCRIPT_PATH"
    rm "$NEW_START_SCRIPT_PATH"
    exit 0
fi

API_KEY_PATH="$BASE_PATH/api_key"
if [ ! -f "$API_KEY_PATH" ]; then
    printf "ERROR API key not found! ($API_KEY_PATH)\n"
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

APP_ARCHIVES_PATH="$(cat app_archives_path)"
if [ -z "$APP_ARCHIVES_PATH" ]; then
    printf "ERROR '$(realpath app_archives_path)' is empty!\n"
    exit 1
fi
CONTAINER_FILES_PATH="$(cat container_files_path)"
if [ -z "$CONTAINER_FILES_PATH" ]; then
    printf "ERROR '$(realpath container_files_path)' is empty!\n"
    exit 1
fi
STARTUP_FILES_PATH="$(cat startup_files_path)"
if [ -z "$STARTUP_FILES_PATH" ]; then
    printf "ERROR '$(realpath startup_files_path)' is empty!\n"
    exit 1
fi

CONTAINER_NAME="ogsh_daemon"
CONTAINER_TAG="ghcr.io/open-game-server-host/daemon:$BRANCH"
printf "INFO  Pulling container image '$CONTAINER_TAG'\n"
docker pull "$CONTAINER_TAG"
docker rm -f $CONTAINER_NAME
docker run -d -u $(id -u):$(getent group docker | cut -d: -f3) --read-only --cpus=1 --memory=500m -v $API_KEY_PATH:/ogsh/api_key -v $DOCKER_SOCK_PATH:/var/run/docker.sock -v "$CONTAINER_FILES_PATH":/ogsh/container_files -v "$APP_ARCHIVES_PATH":/ogsh/app_archives -v "$STARTUP_FILES_PATH":/ogsh/startup_files --name $CONTAINER_NAME $CONTAINER_TAG
printf "INFO  Started container '$CONTAINER_NAME'\n"
docker logs -f $CONTAINER_NAME
