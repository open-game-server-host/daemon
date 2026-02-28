#!/bin/bash
set -e

if [ $EUID != 0 ]; then
    printf "INFO  Running as root\n"
    sudo "$0" "$@"
    exit $?
fi

BRANCH=$1
if [ -z "$BRANCH" ]; then
    BRANCH="main"
fi
printf "INFO  Using branch '$BRANCH'\n"
sleep 3

# Install Docker, jq, curl
function get_distro() {
    if [ -f "/etc/os-release" ]; then
        source "/etc/os-release"
        echo $ID_LIKE
    else
        printf "ERROR Not a linux machine, exiting\n"
        exit 1
    fi
}
DISTRO=$(get_distro)
printf "INFO  Distribution: $DISTRO\n"
printf "INFO  Installing required packages\n"
if [ $DISTRO = "debian" ]; then
    apt update --fix-missing
    apt install -y docker.io jq curl
# TODO other distros
fi

# Validate API key
DAEMON_ID="null"
while [ "$DAEMON_ID" = "null" ]; do
    read -p "Enter API key: " DAEMON_API_KEY
    json=$(curl -s -X GET https://api.opengameserverhost.com/v1/daemon/ -H "authorization: $DAEMON_API_KEY")
    DAEMON_ID=$(jq -r .data.id <<< "$json")
    if [ "$DAEMON_ID" = "null" ]; then
        printf "INFO  Invalid API key\n"
    else
        printf "INFO  Daemon ID: $DAEMON_ID\n"
    fi
done

# Find docker.sock
DOCKER_SOCK_PATH="/var/run/docker.sock"
while [ ! -S "$DOCKER_SOCK_PATH" ]; do
    read -p "'$DOCKER_SOCK_PATH' not found, please enter the docker.sock path: " DOCKER_SOCK_PATH
done

# Create OGSH user and write files
USER="open-game-server-host"
HOME_DIR="/home/$USER"
WORK_DIR="$HOME_DIR/daemon"
adduser $USER --disabled-password --disabled-login --home $HOME_DIR --gecos ""
mkdir -p $WORK_DIR
API_KEY_PATH="$WORK_DIR/api_key"
printf "$DAEMON_API_KEY" > "$API_KEY_PATH"
chmod 600 $API_KEY_PATH
ln -s $DOCKER_SOCK_PATH "$WORK_DIR/docker.sock"
START_SCRIPT_PATH="$WORK_DIR/start.sh"
curl "https://raw.githubusercontent.com/open-game-server-host/daemon/refs/heads/$BRANCH/start.sh" > $START_SCRIPT_PATH
chmod +x $START_SCRIPT_PATH
chmod 600 $START_SCRIPT_PATH
chown -R $USER:$USER $HOME_DIR

# Docker login
printf "INFO  Please log in to GitHub Container Registry using your username and access token\n"
sudo -u $USER docker login ghcr.io

# Add to systemd (TODO support more init systems)
printf "INFO  Creating systemd service\n"
SERVICE_NAME="ogsh_daemon.service"
SYSTEMD_SERVICE_FILE="/etc/systemd/system/$SERVICE_NAME"
rm -rf "$SYSTEMD_SERVICE_FILE"
printf "[Unit]\n" >> $SYSTEMD_SERVICE_FILE
printf "Description=Open Game Server Host Daemon\n" >> $SYSTEMD_SERVICE_FILE
printf "[Service]\n" >> $SYSTEMD_SERVICE_FILE
printf "Type=simple\n" >> $SYSTEMD_SERVICE_FILE
printf "Restart=always\n" >> $SYSTEMD_SERVICE_FILE
printf "RestartSec=1\n" >> $SYSTEMD_SERVICE_FILE
printf "WorkingDirectory=$WORK_DIR\n" >> $SYSTEMD_SERVICE_FILE
printf "User=$USER\n" >> $SYSTEMD_SERVICE_FILE
printf "Group=docker\n" >> $SYSTEMD_SERVICE_FILE
printf "ExecStart=/bin/bash $START_SCRIPT_PATH\n" >> $SYSTEMD_SERVICE_FILE
printf "[Install]\n" >> $SYSTEMD_SERVICE_FILE
printf "WantedBy=multi-user.target\n" >> $SYSTEMD_SERVICE_FILE
systemctl enable $SERVICE_NAME

printf "INFO  Install finished\n"
printf "INFO  Restart your system to start the daemon\n"