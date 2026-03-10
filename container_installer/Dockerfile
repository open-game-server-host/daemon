FROM alpine:3

WORKDIR /ogsh
COPY install.sh install.sh
RUN chmod +x install.sh && apk update -U && apk upgrade && apk add 7zip

ENTRYPOINT ["/bin/sh", "install.sh"]