FROM boltz/c-lightning-plugins:latest

ADD seeder.sh /seeder.sh
RUN chmod +x /seeder.sh
ENV ENTRYPOINT="lightningd"
ENV DATA_DIR="/root/.lightning"
ENTRYPOINT ["/seeder.sh"]

