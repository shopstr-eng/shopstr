FROM ghcr.io/hoytech/strfry:latest

ADD seeder.sh /seeder.sh
RUN chmod +x /seeder.sh
ENV ENTRYPOINT="/app/strfry relay"
ENV DATA_DIR="/db/"
ENTRYPOINT ["/seeder.sh"]

