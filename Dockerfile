
FROM ghcr.io/leicraftmc/vault:latest-web as web

FROM vaultwarden/server

USER root
RUN apk add --no-cache tar
USER vaultwarden

COPY --from=web /web-vault ./web-vault
