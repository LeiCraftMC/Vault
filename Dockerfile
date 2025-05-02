FROM vaultwarden/server

RUN apt-get update && apt-get install -y \
        --no-install-recommends \
        jq \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' vw-version.json