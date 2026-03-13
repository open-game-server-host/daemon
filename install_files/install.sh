#!/bin/bash
set -e

API_KEY=$1
if [ -z "$API_KEY" ]; then
    echo "ERROR Must provide API key as an argument!"
    exit 1
fi

BRANCH=$2
if [ -z "$BRANCH" ]; then
    BRANCH="main"
fi
echo "INFO  Using branch '$BRANCH'"

# Make sure system supports systemd
if [ -z "$(ls /bin | grep systemd | head -1)" ]; then
    echo "ERROR systemd not supported!"
    exit 1
fi

if [ $EUID != 0 ]; then
    echo "INFO  Running as root"
    sudo "$0" "$@"
    exit $?
fi

sleep 3

# Install Docker, jq, curl
function get_distro() {
    if [ -f "/etc/os-release" ]; then
        source "/etc/os-release"
        if [ -z "$ID_LIKE" ]; then
            echo $ID
        else
            echo $ID_LIKE
        fi
    else
        echo "ERROR Not a linux machine, exiting"
        exit 1
    fi
}
DISTRO=$(get_distro)
echo "INFO  Distribution: $DISTRO"
echo "INFO  Installing required packages"
if [ "$DISTRO" = "debian" ]; then
    apt update --fix-missing
    apt install -y docker.io jq curl
elif [ "$DISTRO" = "fedora" ]; then
    yum update -y
    yum install -y docker jq curl
elif [ "$DISTRO" = "arch" ]; then
    yes | pacman -Syu # Update packages
    yes | pacman -Syu docker jq curl
else
    echo "ERROR Unknown distribution '$DISTRO'"
    exit 1
fi

# Validate API key
read -p "Enter API key: " DAEMON_API_KEY
json=$(curl -s -X GET https://api.opengameserverhost.com/v1/daemon/ -H "authorization: $DAEMON_API_KEY")
echo "INFO  Received from API: $json"
DAEMON_ID=$(jq -r .data.id <<< "$json")
if [ "$DAEMON_ID" = "null" ]; then
    echo "ERROR Invalid API key"
else
    echo "INFO  Daemon ID: $DAEMON_ID"
fi

# Find docker.sock
DOCKER_SOCK_PATH="/var/run/docker.sock"
while [ ! -S "$DOCKER_SOCK_PATH" ]; do
    read -p "'$DOCKER_SOCK_PATH' not found, please enter the docker.sock path: " DOCKER_SOCK_PATH
done

USER="open-game-server-host"
HOME_DIR="/home/$USER"
WORK_DIR="$HOME_DIR/daemon"

APP_ARCHIVES_PATH="$WORK_DIR/app_archives"
read -p "Specify where app files are stored: [$APP_ARCHIVES_PATH] " APP_ARCHIVES_READ
if [ ! -z "$APP_ARCHIVES_READ" ]; then
    APP_ARCHIVES_PATH="$APP_ARCHIVES_READ"
fi

CONTAINER_FILES_PATH="$WORK_DIR/container_files"
read -p "Specify where container files are stored: [$CONTAINER_FILES_PATH] " CONTAINER_FILES_READ
if [ ! -z "$CONTAINER_FILES_READ" ]; then
    CONTAINER_FILES_PATH="$CONTAINER_FILES_READ"
fi

STARTUP_FILES_PATH="$WORK_DIR/startup_files"
read -p "Specify where startup files are stored: [$STARTUP_FILES_PATH] " STARTUP_FILES_READ
if [ ! -z "$STARTUP_FILES_READ" ]; then
    STARTUP_FILES_PATH="$STARTUP_FILES_READ"
fi

# Create OGSH user and write files
adduser $USER --disabled-password --disabled-login --home $HOME_DIR --gecos ""
mkdir -p $WORK_DIR
API_KEY_PATH="$WORK_DIR/api_key"
printf "$DAEMON_API_KEY" > "$API_KEY_PATH"
chmod 600 $API_KEY_PATH
ln -s $DOCKER_SOCK_PATH "$WORK_DIR/docker.sock"
START_SCRIPT_PATH="$WORK_DIR/start.sh"
curl "https://raw.githubusercontent.com/open-game-server-host/daemon/refs/heads/$BRANCH/install_files/start.sh" > $START_SCRIPT_PATH
chmod +x $START_SCRIPT_PATH
chmod 760 $START_SCRIPT_PATH
printf "$APP_ARCHIVES_PATH" > "$WORK_DIR/app_archives_path"
printf "$CONTAINER_FILES_PATH" > "$WORK_DIR/container_files_path"
printf "$STARTUP_FILES_PATH" > "$WORK_DIR/startup_files_path"
chown -R $USER:$USER $HOME_DIR
chmod 760 "$WORK_DIR/app_archives_path"
chmod 760 "$WORK_DIR/container_files_path"
chmod 760 "$WORK_DIR/startup_files_path"
mkdir -p "$APP_ARCHIVES_PATH"
mkdir -p "$CONTAINER_FILES_PATH"
mkdir -p "$STARTUP_FILES_PATH"
chmod 760 "$APP_ARCHIVES_PATH"
chmod 760 "$CONTAINER_FILES_PATH"
chmod 760 "$STARTUP_FILES_PATH"
chown -R $USER:$USER "$APP_ARCHIVES_PATH"
chown -R $USER:$USER "$CONTAINER_FILES_PATH"
chown -R $USER:$USER "$STARTUP_FILES_PATH"

# Add to systemd
echo "INFO  Creating systemd service"
curl "https://raw.githubusercontent.com/open-game-server-host/daemon/refs/heads/$BRANCH/install_files/ogshd.service" > /etc/systemd/system/ogshd.service
systemctl enable ogshd.service

echo "INFO  Install finished"
echo "INFO  Restart your system to start the daemon"
echo "INFO  Monitor ogshd output using 'journalctl -fu ogshd'"