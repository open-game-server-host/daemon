#!/bin/bash
set -e

if [ $EUID != 0 ]; then
    printf "Running as root\n"
    sudo "$0" "$@"
    exit $?
fi

# Validate API key
DAEMON_ID="null"
while [ "$DAEMON_ID" = "null" ]; do
    read -p "Enter API key: " DAEMON_API_KEY
    json=$(curl -s -X GET https://api.opengameserverhost.com/v1/daemon/ -H "authorization: $DAEMON_API_KEY")
    DAEMON_ID=$(jq -r .data.id <<< "$json")
    if [ "$DAEMON_ID" = "null" ]; then
        printf "Invalid API key\n"
    else
        printf "Daemon ID: $DAEMON_ID\n"
    fi
done

# Install Docker
function get_distro() {
    if [[ -f /etc/os-release ]]; then
        source /etc/os-release
        echo $ID_LIKE
    else
        printf "Not a linux machine, exiting\n"
        exit 1
    fi
}
DISTRO=$(get_distro)
printf "Distribution: $DISTRO\n"
if [ ! -f "/bin/docker" ]; then
    printf "Installing Docker\n"
    if [ $DISTRO = "debian" ]; then
        apt install -y docker.io
    # TODO other distros
    fi
else
    printf "Docker already installed, skipping\n"
fi

# Find docker.sock
DOCKER_SOCK_PATH="/var/run/docker.sock"
while [ ! -S "$DOCKER_SOCK_PATH" ]; do
    read -p "'$DOCKER_SOCK_PATH' not found, please enter the docker.sock path: " DOCKER_SOCK_PATH
done

# Docker login
printf "Please log in to GitHub Container Registry using your username and access token\n"
docker login ghcr.io

# Create OGSH user and write files
USER="ogsh"
adduser $USER --disabled-password --disabled-login --home /home/$USER --gecos ""
usermod -aG docker $USER
mkdir -p /home/$USER/daemon
printf "$DAEMON_API_KEY" > /home/$USER/api_key # TODO read/write only by owner
ln -s $DOCKER_SOCK_PATH /home/$USER/docker.sock
chown -R $USER:$USER /home/$USER

# Add to init system


printf "Done\n"