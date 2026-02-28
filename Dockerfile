FROM node:24-bookworm-slim

RUN apt update --fix-missing && apt upgrade -y && apt install -y 7zip

WORKDIR /ogsh
ADD node_modules node_modules
ADD build build
RUN chown -R 1337:nogroup /ogsh

ENTRYPOINT ["node", "build/daemon.js"]