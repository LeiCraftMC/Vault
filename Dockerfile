
FROM ghcr.io/leicraftmc/vault:latest-web as web

FROM vaultwarden/server

COPY --from=web /web-vault ./web-vault
