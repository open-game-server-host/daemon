#!/bin/bash
set -e

USER="open-game-server-host"

BASE_PATH="$(realpath .)"
echo "INFO  Working directory '$BASE_PATH'"

BRANCH=$1
if [ -z "$BRANCH" ]; then
    BRANCH="main"
fi
echo "INFO  Branch '$BRANCH'"

echo "INFO  Checking for updates"
START_SCRIPT_PATH="$BASE_PATH/start.sh"
START_SCRIPT_URL="https://raw.githubusercontent.com/open-game-server-host/daemon/refs/heads/$BRANCH/install_files/start.sh"
NEW_START_SCRIPT_PATH="$BASE_PATH/start.sh.update"
curl --output $NEW_START_SCRIPT_PATH $START_SCRIPT_URL
START_SCRIPT_EXISTING_MD5="$(md5sum $START_SCRIPT_PATH | cut -d' ' -f1)"
START_SCRIPT_UPDATED_MD5="$(md5sum $NEW_START_SCRIPT_PATH | cut -d' ' -f1)"
echo "INFO  Existing start script MD5 sum: '$START_SCRIPT_EXISTING_MD5'"
echo "INFO  Updated start script MD5 sum:  '$START_SCRIPT_UPDATED_MD5'"
if [ "$START_SCRIPT_EXISTING_MD5" = "$START_SCRIPT_UPDATED_MD5" ]; then
    echo "INFO  Start script is latest version"
    rm "$NEW_START_SCRIPT_PATH"
else
    echo "INFO  Will install latest start script"
    RESTART="true"
fi

SERVICE_PATH="/etc/systemd/system/ogshd.service"
SERVICE_URL="https://raw.githubusercontent.com/open-game-server-host/daemon/refs/heads/$BRANCH/install_files/ogshd.service"
NEW_SERVICE_PATH="/etc/systed/system/ogshd.service.update"
curl --output $NEW_SERVICE_PATH $SERVICE_URL
SERVICE_EXISTING_MD5="$(md5sum $SERVICE_PATH | cut -d' ' -f1)"
SERVICE_UPDATED_MD5="$(md5sum $NEW_SERVICE_PATH | cut -d' ' -f1)"
echo "INFO  Existing ogshd.service MD5 sum: '$SERVICE_EXISTING_MD5'"
echo "INFO  Updated ogshd.service MD5 sum:  '$SERVICE_UPDATED_MD5'"
if [ "$SERVICE_EXISTING_MD5" = "$SERVICE_UPDATED_MD5" ]; then
    echo "INFO  ogsh.service is latest version"
    rm "$NEW_SERVICE_PATH"
else
    echo "INFO  Will install latest ogshd.service"
    RESTART="true"
fi

if [ -z "$RESTART" ]; then
    echo "INFO  Restarting to update"
    sleep 3

    if [ -f "$NEW_START_SCRIPT_PATH" ]; then
        mv -f "$NEW_START_SCRIPT_PATH" "$START_SCRIPT_PATH"
        rm "$NEW_START_SCRIPT_PATH"
        chown $USER:$USER $START_SCRIPT_PATH
    fi

    if [ -f "$NEW_SERVICE_PATH" ]; then
        mv -f "$NEW_SERVICE_PATH" "$SERVICE_PATH"
        rm "$NEW_SERVICE_PATH"
    fi

    systemctl daemon-reload
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

CONTAINER_NAME="ogshd"
CONTAINER_TAG="ghcr.io/open-game-server-host/daemon:$BRANCH"
echo "INFO  Pulling container image '$CONTAINER_TAG'"
docker pull "$CONTAINER_TAG"
docker rm -f $CONTAINER_NAME
docker run -d -u $USER:$(getent group docker | cut -d: -f3) --read-only --cpus=1 --memory=500m -v $API_KEY_PATH:/ogsh/api_key -v $DOCKER_SOCK_PATH:/var/run/docker.sock -v "$CONTAINER_FILES_PATH":/ogsh/container_files -v "$APP_ARCHIVES_PATH":/ogsh/app_archives -v "$STARTUP_FILES_PATH":/ogsh/startup_files -e "HOST_CONTAINER_FILES_PATH=$CONTAINER_FILES_PATH" -e "HOST_STARTUP_FILES_PATH=$STARTUP_FILES_PATH" -e "HOST_APP_ARCHIVES_PATH=$APP_ARCHIVES_PATH" --name $CONTAINER_NAME $CONTAINER_TAG
echo "INFO  Started container '$CONTAINER_NAME'"
docker logs -f $CONTAINER_NAME