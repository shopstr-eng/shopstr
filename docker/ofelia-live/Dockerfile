FROM debian:11-slim

RUN apt-get update \
    && apt-get -y install ca-certificates curl gnupg \
    && install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc \
    && chmod a+r /etc/apt/keyrings/docker.asc \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list \
    && apt-get update \
    && apt-get -y install docker-ce-cli \
    && apt-get clean -y \
    && rm -rf /var/lib/apt/lists/*

ADD ofelia-live/live-update.sh /live-update.sh

CMD ["bash", "/live-update.sh"]
