FROM node:18.20.4-bullseye

ENV NODE_ENV=development

RUN apt update \
    && apt install -y git \
    && apt clean \
    && rm -rf /var/lib/apt/lists/* 

ARG UID
ARG GID

RUN mkdir -p /testbotstr \
    && cd /testbotstr \ 
    && git clone https://github.com/riccardobl/testbotstr.git . \
    && chown -R $UID:$GID /testbotstr

RUN groupadd -fg "$GID" apprunner
RUN useradd -om -u "$UID" -g "$GID" apprunner
USER apprunner

WORKDIR /app

EXPOSE 3000

COPY package.json package-lock.json ./

CMD ["sh","-c","npm install --no-save --loglevel verbose && npm run knex:migrate && npm run dev"]