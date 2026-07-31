import { CLIBaseCommand, CLICommandArg, CLICommandArgParser, CLICommandContext } from "@cleverjs/cli";
import { S3Service } from "../services/s3-service.js";
import { Utils } from "../utils";
import { BackupArchiveHeader, RawBackupArchive } from "../archive.js";
import { LinuxShellAPI } from "../apis/linux-shell.js";
import { AES256 } from "../crypto.js";
import { Uint64 } from "low-level";
import { BackupHelper } from "../apis/helper.js";
import { Logger } from "../utils/logger.js";
import { ConfigHandler } from "../utils/configHandler.js";
import { NtfyService } from "../services/ntfy.js";

const CMD_ARG_SPEC = CLICommandArg.defineCLIArgSpecs({
    flags: [
        {
            name: "as-cron",
            description: "If set, the backup will be created as if it was run by the cron job. This means that the backup will be created without any user interaction and will use the default configuration.",
            type: "boolean"
        }
    ]
});

export class CreateBackupCMD extends CLIBaseCommand {

    constructor() {
        super({
            name: "create",
            description: "Creates a backup of the Vaultwarden data and uploads it to the S3 bucket.",
            args: CMD_ARG_SPEC
        });
    }

    private async handleCriticalError(ntfyService: NtfyService | null, error: string): Promise<never> {
        Logger.critical("Critical error:", error);
        if (ntfyService) {
            await ntfyService.notifyError("Critical error occurred", Logger.getLogHistory());
        }
        process.exit(1);
    }

    override async run(args: CLICommandArgParser.ParsedArgs<typeof CMD_ARG_SPEC>, ctx: CLICommandContext): Promise<boolean> {

        const config = await ConfigHandler.forceReloadConfig(false);

        let ntfyService: NtfyService | null = null;

        if (config.LCMC_VAULT_BACKUP_NTFY_URL) {
            ntfyService = new NtfyService(
                config.LCMC_VAULT_BACKUP_NTFY_URL,
                config.LCMC_VAULT_BACKUP_NTFY_AUTH_TOKEN
            );
        }

        if (args.flags["as-cron"] && !config.LCMC_VAULT_BACKUP_AUTO_BACKUP) {
            Logger.error("Automatic backup is not enabled.");
            await ntfyService?.notifyWarning("Automatic backup is not enabled.");
            process.exit(1);
        }

        const timeStamp = Date.now();
        const dataDir = config.LCMC_VAULT_BACKUP_DATA_DIR!;

        Logger.log(`Creating new backup of the Vaultwarden data at ${new Date(timeStamp).toLocaleString()}`);

        if (!Utils.existsSync(dataDir)) {
            await this.handleCriticalError(ntfyService, `Vaultwarden data directory '${dataDir}' does not exist.`);
        }

        const dbPath = `${dataDir}/db.sqlite3`;

        // Always create a safe database snapshot unless the user explicitly disabled it.
        let snapshotPath: string | null = null;
        if (Utils.existsSync(dbPath)) {
            Logger.log("Creating safe database snapshot...");
            try {
                snapshotPath = await BackupHelper.createDatabaseSnapshot(dbPath, config.LCMC_VAULT_BACKUP_DATABASE_METHOD);
            } catch (e: any) {
                await this.handleCriticalError(ntfyService, e.message);
            }
            if (snapshotPath) {
                Logger.log("Database snapshot created.");
            }
        } else {
            Logger.warn(`No db.sqlite3 found at ${dbPath}; database will not be included in backup.`);
        }

        let envContent: string | undefined;
        if (config.LCMC_VAULT_BACKUP_SAVE_ENV) {
            envContent = await LinuxShellAPI.getEnv();
            Logger.log("Environment variables copied.");
        }

        Logger.log("Creating tar.gz backup archive...");
        const tarballBytes = await BackupHelper.createTarball(dataDir, snapshotPath, envContent);

        const workDir = `/tmp/lcmc-vault-backup-${Date.now()}`;
        const tarballPath = `${workDir}/backup.tar.gz`;
        const encryptedPath = `${workDir}/backup.tar.gz.enc`;
        const archivePath = `${workDir}/archive.lcmc`;

        try {
            await Bun.write(tarballPath, tarballBytes, { createPath: true });

            const header = new BackupArchiveHeader(Uint64.from(timeStamp));
            const passphrase = config.LCMC_VAULT_BACKUP_ENCRYPTION_PASSPHRASE;

            let contentPath: string;
            let encrypted: boolean;
            if (passphrase) {
                Logger.log("Encrypting backup archive...");
                await AES256.encryptFile(tarballPath, encryptedPath, passphrase);
                contentPath = encryptedPath;
                encrypted = true;
                Logger.log("Encrypted archive created.");
            } else {
                contentPath = tarballPath;
                encrypted = false;
                Logger.log("Unencrypted archive created.");
            }

            Logger.log("Assembling backup archive envelope...");
            await RawBackupArchive.encodeToFile(archivePath, header, encrypted, contentPath);

            Logger.log("Uploading backup to S3...");
            const s3 = S3Service.fromConfig(config);
            await s3.uploadBackupStream(header.getArchiveName(), archivePath);

            Logger.log(`Backup successfully uploaded to S3`);

            await ntfyService?.notifySuccess(`Backup successfully created and uploaded to S3 at ${new Date(timeStamp).toLocaleString()}.`);

            return true;
        } catch (err: any) {
            await this.handleCriticalError(ntfyService, `Failed to create and upload backup: ${Error.isError(err) ? err.message : String(err)}`);
        } finally {
            Utils.rmSync(workDir, true, true);
        }

        return false;
    }
}
