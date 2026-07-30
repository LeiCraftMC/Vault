import { CLIBaseCommand, CLICommandArg, CLICommandArgParser, CLICommandContext } from "@cleverjs/cli";
import { Utils } from "../utils";
import { S3Service } from "../s3-service";
import { BackupArchive } from "../archive";
import { Logger } from "../logger.js";
import { ConfigHandler } from "../configHandler.js";

const CMD_ARG_SPEC = CLICommandArg.defineCLIArgSpecs({
    flags: [
        {
            name: "backup-name",
            type: "string",
            description: "The name of the backup to download.",
            required: true,
            checkFN: (value: string) => {
                if (value.match(/[^a-zA-Z0-9-_]/)) {
                    return "Backup name can only contain alphanumeric characters, dashes and underscores.";
                }
                return true;
            }
        },
        {
            name: "dest-dir",
            type: "string",
            description: "The destination directory where the backup will be extracted.",
            required: true,
            checkFN: (value: string) => {
                if (!Utils.isDirWritable(value)) {
                    return `The destination directory '${value}' does not exist or is not writable.`;
                }
                return true;
            }
        }
    ]
});

export class DownloadBackupCMD extends CLIBaseCommand {

    constructor() {
        super({
            name: "download",
            description: "Downloads a backup from the S3 bucket and extracts it into to given directory.",
            args: CMD_ARG_SPEC
        });
    }

    readonly name = "download";
    readonly description = "Downloads a backup from the S3 bucket and extracts it into to given directory.";

    override async run(args: CLICommandArgParser.ParsedArgs<typeof CMD_ARG_SPEC>, ctx: CLICommandContext): Promise<boolean> {

        const config = ConfigHandler.getConfig()!;

        const backupName = args.flags["backup-name"];
        const destination = args.flags["dest-dir"];
        const fullDestination = `${destination}/${backupName}`;

        if (Utils.existsSync(fullDestination)) {
            Logger.error(`The destination directory '${fullDestination}' already exists.`);
            process.exit(1);
        }
        
        const s3 = S3Service.fromConfig(config);
        Logger.log(`Downloading backup '${backupName}' from S3...`);

        try {
            const rawBackup = await s3.downloadBackup(backupName);
            if (!rawBackup) {
                Logger.error(`A backup with the name '${backupName}' does not exist.`);
                process.exit(1);
            }

            Logger.log(`Downloaded backup '${backupName}' from S3.`);
            
            if (rawBackup.encrypted && !config.LCMC_VAULT_BACKUP_ENCRYPTION_PASSPHRASE) {
                Logger.error("The backup is encrypted. You need to provide the passphrase to decrypt it.");
                process.exit(1);
            }

            Logger.log("Decrypting the backup...");

            const backup = BackupArchive.fromRaw(rawBackup, config.LCMC_VAULT_BACKUP_ENCRYPTION_PASSPHRASE);
            if (!backup) {
                Logger.error("The backup is corrupted or not a valid backup file.");
                if (rawBackup.encrypted) {
                    Logger.error("Could not decrypt the backup. Make sure you are using the correct passphrase.");
                }
                process.exit(1);
            }        

            Logger.log("Extracting the backup...");

            const files = await backup.getFileList();
            for (const [path, data] of Object.entries(files)) {

                const filePath = `${fullDestination}/${path}`;
                await Bun.write(filePath, data.getRaw(), { createPath: true });

                Logger.log(`Extracted ${path} to ${filePath}`);
            }

            Logger.log(`Backup '${backupName}' downloaded and extracted successfully to '${fullDestination}'.`);
            return true;

        } catch (e: any) {
            Logger.error(`Error downloading the backup: ${e.stack}`);
            return false;
        }
    }

}
