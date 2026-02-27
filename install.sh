#!/bin/bash
set -e

# TODO ask user for app archives path
# TODO ask user for container files path
# startup files don't matter because they're small

if [ $EUID != 0 ]; then
    sudo "$0" "$@"
    exit $?
fi

DAEMON_BRANCH="main"

# Validate API key to get Daemon ID
OGSH_DAEMON_ID="null"
while [ "$OGSH_DAEMON_ID" = "null" ]; do
    read -p "Enter API key: " OGSH_DAEMON_API_KEY
    json=$(curl -s -X GET https://api.opengameserverhost.com/v1/daemon/ -H "authorization: $OGSH_DAEMON_API_KEY")
    OGSH_DAEMON_ID=$(jq -r .data.id <<< "$json")
    if [ "$OGSH_DAEMON_ID" = "null" ]; then
        printf "Invalid API key\n"
    else
        printf "Daemon ID: $OGSH_DAEMON_ID\n"
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
OGSH_DOCKER_SOCK_PATH="/var/run/docker.sock"
while [ ! -S "$OGSH_DOCKER_SOCK_PATH" ]; do
    read -p "'$OGSH_DOCKER_SOCK_PATH' not found, please enter the docker.sock path: " OGSH_DOCKER_SOCK_PATH
done

# TODO start on boot and automatically restart container on stop
printf "\nCreating Daemon container\n"
CONTAINER_TAG="ghcr.io/open-game-server-host/daemon:$DAEMON_BRANCH"
docker rm -f ogsh_daemon # TODO silent if there is no container
# TODO change credentials path from my local machine
# TODO move api key to credentials file so it can be changed
docker container create -it -u 1337:$(getent group docker | cut -d: -f3) --cpus=1 --memory=512m --restart unless-stopped -v /home/dom/Documents/open-game-server-host/Git/daemon/credentials.json:/ogsh/credentials.json -e OGSH_DAEMON_ID="$OGSH_DAEMON_ID" -e OGSH_DAEMON_API_KEY="$OGSH_DAEMON_API_KEY" -v $OGSH_DOCKER_SOCK_PATH:/var/run/docker.sock --name ogsh_daemon $CONTAINER_TAG
printf "\nStarting Daemon container\n"
docker start ogsh_daemon

printf "Done\n"