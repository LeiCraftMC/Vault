import { CLIBaseCommand, CLICommandArg, CLICommandArgParser, CLICommandContext } from "@cleverjs/cli";
import { S3Service } from "../s3-service.js";
import { Utils } from "../utils.js";
import { BackupArchive, type RawBackupArchive } from "../archive.js";
import { LinuxShellAPI } from "../apis/linux-shell.js";
import { Uint, Uint64 } from "low-level";
import { BackupHelper } from "../apis/helper.js";
import { Logger } from "../logger.js";
import { ConfigHandler } from "../configHandler.js";

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

    override async run(args: CLICommandArgParser.ParsedArgs<typeof CMD_ARG_SPEC>, ctx: CLICommandContext): Promise<boolean> {

        const config = ConfigHandler.getConfig()!;

        if (args.flags["as-cron"] && !config.LCMC_VAULT_BACKUP_AUTO_BACKUP) {
            Logger.error("Automatic backup is not enabled.");
            process.exit(1);
        }

        const timeStamp = Date.now();
        const dataDir = config.LCMC_VAULT_BACKUP_DATA_DIR!;

        Logger.log(`Creating new backup of the Vaultwarden data at ${new Date(timeStamp).toLocaleString()}`);

        if (!Utils.existsSync(dataDir)) {
            Logger.error(`Vaultwarden data directory '${dataDir}' does not exist.`);
            process.exit(1);
        }

        const dbPath = `${dataDir}/db.sqlite3`;

        // Always create a safe database snapshot unless the user explicitly disabled it.
        let snapshotPath: string | null = null;
        if (Utils.existsSync(dbPath)) {
            Logger.log("Creating safe database snapshot...");
            snapshotPath = await BackupHelper.createDatabaseSnapshot(dbPath, config.LCMC_VAULT_BACKUP_DATABASE_METHOD);
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

        const archive = BackupArchive.fromTarball(Uint64.from(timeStamp), Uint.from(tarballBytes));

        let rawArchive: RawBackupArchive;
        if (config.LCMC_VAULT_BACKUP_ENCRYPTION_PASSPHRASE) {
            rawArchive = archive.encrypt(config.LCMC_VAULT_BACKUP_ENCRYPTION_PASSPHRASE);
            Logger.log("Encrypted archive created.");
        } else {
            rawArchive = archive.toRaw();
            Logger.log("Unencrypted archive created.");
        }

        Logger.log("Uploading backup to S3...");

        const s3 = S3Service.fromConfig(config);
        await s3.uploadBackup(rawArchive);

        Logger.log(`Backup successfully uploaded to S3`);

        return true;
    }
}
