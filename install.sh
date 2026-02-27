#!/bin/bash
set -e

# Validate API key to get Daemon ID
OGSH_DAEMON_ID=""
while [ "$OGSH_DAEMON_ID" = "" ]; do
    read -p "Enter API key: " OGSH_DAEMON_API_KEY
    OGSH_DAEMON_ID=$(curl -X GET https://api.opengameserverhost.com/v1/daemon/ -H "authorization: $OGSH_DAEMON_API_KEY")
done

# Install Docker
function get_distro() {
    if [[ -f /etc/os-release ]]
    then
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
OGSH_DOCKER_SOCK_PATH="/var/run/docker.sock"
while [ ! -S "$OGSH_DOCKER_SOCK_PATH" ]; do
    read -p "'$OGSH_DOCKER_SOCK_PATH' not found, please enter the docker.sock path: " OGSH_DOCKER_SOCK_PATH
done

# TODO start on boot and automatically restart container on stop