FROM ubuntu:24.04@sha256:b3cc40b72b93588182b5410f723c7aaf142363311c2aa993d8a453ddcbb3ae15
ARG TARGETARCH
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl libnuma1 libuuid1 redis-tools \
    && rm -rf /var/lib/apt/lists/*
RUN set -eu; \
    case "$TARGETARCH" in \
      arm64) arch=aarch64; checksum=819df5f9f6c534f0fa988d1a9ec3531f1e6b0651527591a54e7235688bf8d984 ;; \
      amd64) arch=x86_64; checksum=8a3e66f313e7112a3a9dff7b1a0d67ae34e988dfa51f5c310e860d0b3f2daa77 ;; \
      *) echo 'Use native linux/amd64 or linux/arm64' >&2; exit 1 ;; \
    esac; \
    curl -fL "https://github.com/eloqdata/lavik/releases/download/v0.1.0-beta.1/lavik-v0.1.0-beta.1-linux-${arch}-minimal.tar.gz" -o /tmp/lavik.tar.gz; \
    echo "$checksum  /tmp/lavik.tar.gz" | sha256sum -c -; \
    mkdir /opt/lavik; tar -xzf /tmp/lavik.tar.gz --strip-components=1 -C /opt/lavik; \
    rm /tmp/lavik.tar.gz; chmod -R a+rX /opt/lavik; \
    install -d -o 65532 -g 65532 /var/lib/lavik
COPY start.sh /usr/local/bin/start-lavik
RUN chmod 755 /usr/local/bin/start-lavik
USER 65532:65532
EXPOSE 6379 9100
ENTRYPOINT ["/usr/local/bin/start-lavik"]
