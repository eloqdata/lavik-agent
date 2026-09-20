FROM ubuntu:24.04@sha256:b3cc40b72b93588182b5410f723c7aaf142363311c2aa993d8a453ddcbb3ae15
RUN apt-get update && apt-get install -y --no-install-recommends python3 redis-tools ca-certificates \
    && rm -rf /var/lib/apt/lists/*
ARG ARCHIVE_SHA256
ARG HARNESS_SHA256
ARG RECIPES_SHA256
LABEL dev.lavik.harness-sha256=$HARNESS_SHA256 dev.lavik.recipes-sha256=$RECIPES_SHA256
COPY lavik.tar.gz /tmp/lavik.tar.gz
RUN echo "${ARCHIVE_SHA256}  /tmp/lavik.tar.gz" | sha256sum -c - \
    && mkdir /opt/lavik && tar -xzf /tmp/lavik.tar.gz --strip-components=1 -C /opt/lavik \
    && rm /tmp/lavik.tar.gz && chmod -R a+rX /opt/lavik
COPY run.py start.sh recipes.json /verify/
ENV PATH="/opt/lavik:${PATH}"
USER 65532:65532
WORKDIR /tmp
ENTRYPOINT ["python3", "/verify/run.py"]
