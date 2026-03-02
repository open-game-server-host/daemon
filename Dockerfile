FROM node:24-bookworm-slim

RUN apt update --fix-missing && apt upgrade -y && apt install -y 7zip

WORKDIR /ogsh
ADD node_modules node_modules
ADD build build
RUN chmod -R 007 /ogsh

ENTRYPOINT ["node", "build/daemon.js"]