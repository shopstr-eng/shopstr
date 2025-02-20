FROM boltz/elements:23.2.6

ADD seeder.sh /seeder.sh
RUN chmod +x /seeder.sh
ENV ENTRYPOINT="elementsd"
ENV DATA_DIR="/root/.elements"
ENTRYPOINT ["/seeder.sh"]

