# LeiCraft_MC Vault Backup Tool

An automated way to backup your [Vaultwarden](https://github.com/dani-garcia/vaultwarden) instance and store the backups safely in S3-compatible storage.

## Features

- Automated scheduled backups of a Vaultwarden data directory
- Safe SQLite snapshot before archiving
- S3 storage support for offsite backups
- Easy setup with Docker Compose
- Optional AES-256-GCM encryption for backup files

## Requirements

- Docker and Docker Compose
- A running Vaultwarden instance
- S3-compatible storage

## Quick Start

1. Clone this repository.
2. Configure the environment variables in a `.env` file:
    ```bash
    cp config/sample.env .env
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
LCMC_VAULT_BACKUP_S3_ENDPOINT=                                           # S3 Endpoint. Example: "https://s3.amazonaws.com"
LCMC_VAULT_BACKUP_S3_REGION=us-east-1                                    # (Optional) S3 Region. Example: "us-east-1"
LCMC_VAULT_BACKUP_S3_ACCESS_KEY_ID=                                      # S3 Access Key ID
LCMC_VAULT_BACKUP_S3_SECRET_ACCESS_KEY=                                # S3 Secret Access Key
LCMC_VAULT_BACKUP_S3_BUCKET=                                             # (Optional) S3 Bucket Name
LCMC_VAULT_BACKUP_S3_BASE_PATH=                                          # (Optional) S3 Base Path. Example: "path/to/backups"

# Backup configurations
LCMC_VAULT_BACKUP_DATA_DIR=/data                                         # (Optional) Path to the Vaultwarden data directory. Defaults to "/data".
LCMC_VAULT_BACKUP_DATABASE_METHOD=auto                                   # (Optional) How to snapshot db.sqlite3: "auto", "vaultwarden", "sqlite3" or "none". Defaults to "auto".
LCMC_VAULT_BACKUP_SAVE_ENV=false                                         # (Optional) Save container environment variables into the backup as backup.env. Either "true" or "false".

LCMC_VAULT_BACKUP_AUTO_BACKUP=true                                       # (Optional) Enable daily backups at 00:00 UTC. Either "true" or "false".

LCMC_VAULT_BACKUP_RETENTION_DAYS=30                                      # (Optional) Delete backups older than this many days. Leave unset to keep all backups.
LCMC_VAULT_BACKUP_RETENTION_MIN_COUNT=3                                  # (Optional) Always keep at least this many newest backups. Defaults to 1.

# Encryption configurations
LCMC_VAULT_BACKUP_ENCRYPTION_PASSPHRASE=                               # (Optional) The passphrase for encrypting the backup. Leave empty to disable encryption.
```

## Backup Process

The backup tool creates a safe snapshot of the running Vaultwarden SQLite database, then packs the following data into a real gzip-compressed tar archive (`tar.gz`) inside the encrypted envelope:

- `data/db.sqlite3` – a consistent snapshot of the SQLite database
- `data/attachments/` – file attachments
- `data/rsa_key.*` – JWT signing keys
- `data/config.json` – admin configuration
- `data/sends/` and `data/icon_cache/` (if present)
- `backup.env` – container environment variables (if enabled)

The live `db.sqlite3`, `db.sqlite3-wal` and `db.sqlite3-shm` files are never copied directly.

### Database snapshot methods

- `auto` (default): tries the built-in `/vaultwarden backup` command, then falls back to `sqlite3`.
- `vaultwarden`: uses `/vaultwarden backup` only.
- `sqlite3`: uses the `sqlite3` CLI (`.backup` command) only.
- `none`: skips the database snapshot. Useful if you want to back up only the files.

## Backup Retention

Backups are never deleted automatically unless retention is configured. To limit storage growth, set:

- `LCMC_VAULT_BACKUP_RETENTION_DAYS` – backups older than this many days are candidates for deletion.
- `LCMC_VAULT_BACKUP_RETENTION_MIN_COUNT` – newest backups to always keep, regardless of age. Defaults to 1.

Retention cleanup runs automatically after every successful `create` when `LCMC_VAULT_BACKUP_RETENTION_DAYS` is set. You can also trigger it manually:

```bash
lcmc-vault-backups cleanup
```

## Restore Process

1. Stop the Vaultwarden container completely.
2. Download and extract the backup:
    ```bash
    lcmc-vault-backups download --backup-name=BACKUP_NAME --dest-dir=/tmp/restore
    ```
3. The extracted directory contains a `data/` folder and, optionally, `backup.env`.
4. Replace the contents of your Vaultwarden data directory with the extracted `data/` folder.
5. **Important:** delete any existing `db.sqlite3-wal` file next to `db.sqlite3` before starting Vaultwarden, otherwise the database may become corrupted.
6. Start Vaultwarden again.

## License

This project is licensed under the GNU AFFERO GENERAL PUBLIC LICENSE - see the LICENSE file for details.
