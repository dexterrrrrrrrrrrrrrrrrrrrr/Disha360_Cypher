# syntax=docker/dockerfile:1
FROM node:22.23.3-bookworm-slim
# Dependencies are installed only during an operator-controlled build, never per submission.
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then \
      apt-get -o Acquire::https::CaInfo=/run/secrets/proxy_ca update && \
      apt-get -o Acquire::https::CaInfo=/run/secrets/proxy_ca install -y --no-install-recommends python3 g++ openjdk-17-jdk-headless; \
    else apt-get update && apt-get install -y --no-install-recommends python3 g++ openjdk-17-jdk-headless; fi \
    && rm -rf /var/lib/apt/lists/*
USER 65534:65534
WORKDIR /workspace
ENTRYPOINT ["/bin/sleep"]
CMD ["300"]
