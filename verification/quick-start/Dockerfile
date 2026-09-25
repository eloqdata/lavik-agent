FROM ubuntu:24.04@sha256:b3cc40b72b93588182b5410f723c7aaf142363311c2aa993d8a453ddcbb3ae15
RUN apt-get update && apt-get install -y --no-install-recommends python3 sudo \
    && rm -rf /var/lib/apt/lists/*
COPY dependencies-minimal.sh dependencies-standard.sh /verify/
RUN bash /verify/dependencies-minimal.sh && bash /verify/dependencies-standard.sh \
    && rm -rf /var/lib/apt/lists/*
COPY run.py start.sh recipes.json /verify/
USER 65532:65532
WORKDIR /tmp
ENTRYPOINT ["bash"]
