FROM node:24-alpine

RUN apk -U update && apk upgrade && apk add 7zip

WORKDIR "/home/ogsh"
RUN adduser --uid 1337 --disabled-password --gecos "" ogsh && chown -R 1337 /home/ogsh
USER ogsh

ADD node_modules node_modules
ADD build build

ENTRYPOINT ["node", "build/daemon.js"]