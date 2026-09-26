FROM ubuntu:24.04@sha256:b3cc40b72b93588182b5410f723c7aaf142363311c2aa993d8a453ddcbb3ae15
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    aptly gnupg dpkg-dev ca-certificates curl python3 xz-utils \
    && rm -rf /var/lib/apt/lists/*
ENV GNUPGHOME=/tmp/gnupg
WORKDIR /work
ENTRYPOINT ["python3", "/inputs/build.py"]
