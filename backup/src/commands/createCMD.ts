import { CLIBaseCommand, CLICommandArg, CLICommandArgParser, CLICommandContext } from "@cleverjs/cli";
import { S3Service } from "../s3-service.js";
import { Utils } from "../utils.js";
import { BackupArchive, type RawBackupArchive, type FileList } from "../archive.js";
import { LinuxShellAPI } from "../apis/linux-shell.js";
import { Uint64 } from "low-level";
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
            description: "Creates a backup of the Vault data and uploads it to the S3 bucket.",
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

        Logger.log(`Creating new backup of the Vault at ${new Date(timeStamp).toLocaleString()}`);
        const files: FileList = {};

        // files["data/passbolt.sql"] = await BackupHelper.getNewDBDump(config.PB_CAKE_BIN, config.PB_WEB_SERVER_USER);
        // Logger.log("Database dump created.");

        // files["gpg/serverkey_private.asc"] = await LinuxShellAPI.getFile(config.PB_GPG_SERVER_PRIVATE_KEY);
        // files["gpg/serverkey.asc"] = await LinuxShellAPI.getFile(config.PB_GPG_SERVER_PUBLIC_KEY);
        // Logger.log("GPG keys copied.");

        // if (config.PB_PASSBOLT_CONFIG_FILE) {
        //     files["config/passbolt.php"] = await LinuxShellAPI.getFile(config.PB_PASSBOLT_CONFIG_FILE);
        //     Logger.log("Passbolt config copied.");
        // }

        if (config.LCMC_VAULT_BACKUP_SAVE_ENV) {
            files["env/lcmc-vault.env"] = await LinuxShellAPI.getEnv();
            Logger.log("Environment variables copied.");
        }

        Logger.log("Creating backup archive...");
        const archive = BackupArchive.fromFileList(Uint64.from(timeStamp), files);

        let rawArchive: RawBackupArchive;
        if (config.LCMC_VAULT_BACKUP_ENCRYPTION_PASSPHRASE) {
            rawArchive = archive.encrypt(config.LCMC_VAULT_BACKUP_ENCRYPTION_PASSPHRASE);
            Logger.log("Encrypted successfully created.");
        } else {
            rawArchive = archive.toRaw();
            Logger.log("Unencrypted successfully created.");
        }

        Logger.log("Uploading backup to S3...");

        const s3 = S3Service.fromConfig(config);
        await s3.uploadBackup(rawArchive);

        Logger.log(`Backup successfully uploaded to S3`);

        return true;
    }
}
