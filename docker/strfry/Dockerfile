FROM ghcr.io/hoytech/strfry:latest@sha256:0e2dd1d70ab094a0c679c4cc74b5214cbfe4302b6963d61479340532af4f1d5f

ADD seeder.sh /seeder.sh
RUN chmod +x /seeder.sh
ENV ENTRYPOINT="/app/strfry relay"
ENV DATA_DIR="/db/"
ENTRYPOINT ["/seeder.sh"]

