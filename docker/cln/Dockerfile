FROM boltz/c-lightning-plugins:latest@sha256:41031e7d126df6b0d82556bf3e7913dd81e265d402e553b54933dfe8f6adecbc

ADD seeder.sh /seeder.sh
RUN chmod +x /seeder.sh
ENV ENTRYPOINT="lightningd"
ENV DATA_DIR="/root/.lightning"
ENTRYPOINT ["/seeder.sh"]

