# LeiCraft_MC Vault - An automated way to backup your Passbolt data

Passbolt-Backups is a tool that automates the backup process for your Passbolt password manager, ensuring your critical credential data is regularly saved and securely stored.

## Features

- Automated scheduled backups of Passbolt data
- Database and GPG keys backup
- S3 storage support for offsite backups
- Configurable backup retention
- Easy setup with Docker Compose
- Optional encryption for backup files

## Requirements

- Docker and Docker Compose
- A running Passbolt instance
- S3-compatible storage

## Quick Start

1. Clone this repository:
    ```bash
    git clone https://github.com/yourusername/Passbolt-Backups.git
    cd Passbolt-Backups/docker
    ```

2. Configure the environment variables in a `.env` file:
    ```bash
    cp ../sample.env .env
    # Edit .env with your configuration
    ```

3. Run with Docker Compose:
    ```bash
    docker-compose up -d
    ```

## Configuration Options

Edit your `.env` file to configure the following options:

```
# S3 configurations
VB_S3_ENDPOINT=                                                        # S3 Endpoint. Example: "https://s3.amazonaws.com"
VB_S3_ACCESS_KEY_ID=                                                   # S3 Access Key ID
VB_S3_SECRET_ACCESS_KEY=                                               # S3 Secret Access Key
VB_S3_BUCKET=                                                          # (Optional) S3 Bucket Name
VB_S3_BASE_PATH=                                                       # (Optional) S3 Base Path. Example: "path/to/backups

# Backup configurations
PB_WEB_SERVER_USER=www-data                                            # User of the Web Server. Example: "www-data"
PB_CAKE_BIN=/usr/share/php/passbolt/bin/cake                           # Path to the Cake Bin. Example: "/usr/share/php/passbolt/bin/cake"
PB_GPG_SERVER_PRIVATE_KEY=/etc/passbolt/gpg/serverkey_private.asc      # Path to the Passbolt Server Private Key
PB_GPG_SERVER_PUBLIC_KEY=/etc/passbolt/gpg/serverkey.asc               # Path to the Passbolt Server Public Key
PB_PASSBOLT_CONFIG_FILE=                                               # (Optional) Path to the Passbolt Config File

PB_SAVE_ENV=true                                                      # Grab the env config from container rather than file. Either "true" or "false"

# Encryption configurations
VB_ENCRYPTION_PASSPHRASE=                                              # (Optional) Passphrase for backup encryption. Leave empty to disable
```

## Docker Compose Example

```yaml
version: '3.8'

services:
  db:
    image: mariadb:10.11
    restart: unless-stopped
    environment:
      MYSQL_RANDOM_ROOT_PASSWORD: "true"
      MYSQL_DATABASE: "passbolt"
      MYSQL_USER: "passbolt"
      MYSQL_PASSWORD: "P4ssb0lt"
    volumes:
      - database_volume:/var/lib/mysql

  passbolt:
    image: ghcr.io/leicraft/passbolt-with-backups:latest-mysql
    restart: unless-stopped
    depends_on:
      - db
    environment:
      APP_FULL_BASE_URL: https://passbolt.local
      DATASOURCES_DEFAULT_HOST: "db"
      DATASOURCES_DEFAULT_USERNAME: "passbolt"
      DATASOURCES_DEFAULT_PASSWORD: "P4ssb0lt"
      DATASOURCES_DEFAULT_DATABASE: "passbolt"
    volumes:
      - gpg_volume:/etc/passbolt/gpg
      - jwt_volume:/etc/passbolt/jwt
    command:
      [
        "/usr/bin/wait-for.sh",
        "-t",
        "0",
        "db:3306",
        "--",
        "/docker-entrypoint.sh",
      ]
    ports:
      - 80:80
      - 443:443

volumes:
  database_volume:
  gpg_volume:
  jwt_volume:
```

## Backup Process

The backup includes:
- Database dump
- GPG keys (server keys)
- Env configuration (optional)
- Passbolt configuration (optional)

Backups can be stored locally or in an S3-compatible storage with optional encryption.

## Restore Process



## License

This project is licensed under the GNU AFFERO GENERAL PUBLIC LICENSE - see the LICENSE file for details.
