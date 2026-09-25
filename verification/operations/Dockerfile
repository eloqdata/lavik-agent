FROM ubuntu:24.04@sha256:b3cc40b72b93588182b5410f723c7aaf142363311c2aa993d8a453ddcbb3ae15
RUN apt-get update && apt-get install -y --no-install-recommends python3 redis-tools curl ca-certificates libnuma1 libuuid1 \
    && rm -rf /var/lib/apt/lists/*
ARG ARCHIVE_SHA256
COPY package.tar.gz /tmp/package.tar.gz
RUN echo "${ARCHIVE_SHA256}  /tmp/package.tar.gz" | sha256sum -c - \
    && mkdir /opt/lavik && tar -xzf /tmp/package.tar.gz --strip-components=1 -C /opt/lavik \
    && rm /tmp/package.tar.gz && chmod -R a+rX /opt/lavik
COPY snippets /verification/snippets
COPY run.py /verification/run.py
USER 65532:65532
WORKDIR /tmp
ENTRYPOINT ["python3", "/verification/run.py"]
