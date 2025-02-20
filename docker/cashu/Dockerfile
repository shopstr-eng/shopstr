FROM cashubtc/nutshell:0.16.4

ADD seeder.sh /seeder.sh
RUN chmod +x /seeder.sh
ENV ENTRYPOINT="poetry run mint"
ENV DATA_DIR="/app/.cashu"
ENTRYPOINT ["/seeder.sh"]

