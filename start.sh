#!/bin/bash
set -e

BASE_PATH="$(realpath .)"
echo "INFO  Working directory '$BASE_PATH'"

BRANCH=$1
if [ -z "$BRANCH" ]; then
    BRANCH="main"
fi

USER="$(whoami)"
echo "INFO  Running as user '$USER'"

echo "INFO  Checking for new start script"
START_SCRIPT_PATH="$BASE_PATH/start.sh"
START_SCRIPT_URL="https://raw.githubusercontent.com/open-game-server-host/daemon/refs/heads/$BRANCH/start.sh"
NEW_START_SCRIPT="$(curl $START_SCRIPT_URL)"
if [ "$(cat $START_SCRIPT_PATH)" = "$NEW_START_SCRIPT" ]; then
    echo "INFO  This is the latest version"
else
    echo "INFO  Restarting to update"
    sleep 3
    NEW_START_SCRIPT_PATH="$BASE_PATH/start.sh.update"
    printf "$NEW_START_SCRIPT" > "$NEW_START_SCRIPT_PATH"
    cp "$NEW_START_SCRIPT_PATH" "$START_SCRIPT_PATH"
    rm "$NEW_START_SCRIPT_PATH"
    exit 0
fi

API_KEY_PATH="$BASE_PATH/api_key"
if [ ! -f "$API_KEY_PATH" ]; then
    echo "ERROR API key not found! ($API_KEY_PATH)"
    exit 1
fi

DOCKER_SOCK_PATH="$BASE_PATH/docker.sock"
if [ -S "$DOCKER_SOCK_PATH" ]; then
    echo "INFO  Using docker socket at '$DOCKER_SOCK_PATH'"
elif [ -S "/var/run/docker.sock" ]; then
    DOCKER_SOCK_PATH="/var/run/docker.sock"
    echo "INFO  Using docker socket at '$DOCKER_SOCK_PATH'"
else
    if [ "$DOCKER_SOCK_PATH" = "/var/run/docker.sock" ]; then
        echo "ERROR Could not find docker socket at '$DOCKER_SOCK_PATH'!"
    else
        echo "ERROR Could not find docker socket at '$DOCKER_SOCK_PATH' or '/var/run/docker.sock'!"
    fi
    exit 1
fi

APP_ARCHIVES_PATH="$(cat app_archives_path)"
if [ -z "$APP_ARCHIVES_PATH" ]; then
    echo "ERROR '$(realpath app_archives_path)' is empty!"
    exit 1
fi
CONTAINER_FILES_PATH="$(cat container_files_path)"
if [ -z "$CONTAINER_FILES_PATH" ]; then
    echo "ERROR '$(realpath container_files_path)' is empty!"
    exit 1
fi
STARTUP_FILES_PATH="$(cat startup_files_path)"
if [ -z "$STARTUP_FILES_PATH" ]; then
    echo "ERROR '$(realpath startup_files_path)' is empty!"
    exit 1
fi

CONTAINER_NAME="ogsh_daemon"
CONTAINER_TAG="ghcr.io/open-game-server-host/daemon:$BRANCH"
echo "INFO  Pulling container image '$CONTAINER_TAG'"
docker pull "$CONTAINER_TAG"
docker rm -f $CONTAINER_NAME
docker run -d -u $(id -u):$(getent group docker | cut -d: -f3) --read-only --cpus=1 --memory=500m -v $API_KEY_PATH:/ogsh/api_key -v $DOCKER_SOCK_PATH:/var/run/docker.sock -v "$CONTAINER_FILES_PATH":/ogsh/container_files -v "$APP_ARCHIVES_PATH":/ogsh/app_archives -v "$STARTUP_FILES_PATH":/ogsh/startup_files -e "HOST_CONTAINER_FILES_PATH=$CONTAINER_FILES_PATH" -e "HOST_STARTUP_FILES_PATH=$STARTUP_FILES_PATH" -e "CONTAINER_USERNAME=$USER" --name $CONTAINER_NAME $CONTAINER_TAG
echo "INFO  Started container '$CONTAINER_NAME'"
docker logs -f $CONTAINER_NAME
