FROM hauxir/imgpush@sha256:2e390756537974ad7b01e6779a457c42f59ae8f1f7a82c61a8ed34487040f2a6

ADD seeder.sh /seeder.sh
RUN chmod +x /seeder.sh
ENV ENTRYPOINT="bash /app/entrypoint.sh"
ENV DATA_DIR="/images"
ENTRYPOINT ["/seeder.sh"]

