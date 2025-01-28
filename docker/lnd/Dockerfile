FROM boltz/lnd:0.18.0-beta

RUN apt-get update && \
    apt-get -y install jq&& \
    apt-get clean -y && \
    rm -rf /var/lib/apt/lists/*

ADD seeder.sh /seeder.sh
RUN chmod +x /seeder.sh
ENV ENTRYPOINT="lnd"
ENV DATA_DIR="/root/.lnd"
ENTRYPOINT ["/seeder.sh"]

