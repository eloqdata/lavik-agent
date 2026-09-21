FROM golang:1.25.1-bookworm AS golang
FROM node:22.20.0-bookworm-slim AS node
FROM lavik-doc-verifier:0.1.0
USER root
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends python3-venv ruby php-cli php-redis composer default-jdk-headless maven && rm -rf /var/lib/apt/lists/*
COPY --from=node /usr/local/ /usr/local/
COPY --from=golang /usr/local/go /usr/local/go
ENV PATH="/opt/python/bin:/usr/local/go/bin:${PATH}"
RUN python3 -m venv /opt/python && pip install --no-cache-dir redis==8.1.0 valkey==6.1.1 valkey-glide==2.5.2
WORKDIR /clients
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY go.mod go-client.go ./
RUN go mod tidy && go build -o /clients/go-client go-client.go
COPY pom.xml ./
RUN mvn -q dependency:copy-dependencies -DoutputDirectory=/clients/jars
COPY Clients.java ./
RUN javac -cp '/clients/jars/*' Clients.java
COPY composer.json ./
RUN apt-get update && apt-get install -y --no-install-recommends unzip && rm -rf /var/lib/apt/lists/*
RUN composer install --no-interaction --no-progress --no-dev
RUN gem install redis -v 5.4.1 --no-document
COPY python-client.py node-client.mjs php-client.php ruby-client.rb ./
USER 65532:65532
WORKDIR /tmp
ENTRYPOINT ["python3", "/manual/client-run.py"]
