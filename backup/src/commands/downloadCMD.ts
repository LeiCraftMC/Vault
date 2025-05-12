import { CLICMD } from "@cleverjs/cli";
import { Utils } from "../utils";
import { S3Service } from "../s3-service";
import { BackupArchive } from "../archive";
import { existsSync } from "fs";
import { Logger } from "../logger.js";

export class DownloadBackupCMD extends CLICMD {

    readonly name = "download";
    readonly description = "Downloads a backup from the S3 bucket and extracts it into to given directory.";
    readonly usage = "create [--config=<path_to_env>] <backup_name> <destination_directory>";

    async run(args: string[]) {

        const result = await Utils.parseDefaultArgs(args);
        const config = result.config;
        args = result.args;

        if (args.length !== 2) {
            Logger.error("You have to specify the backup name and the destination directory.");
            process.exit(1);
        }

        const backupName = args[0] as string;
        const destination = args[1] as string;
        const fullDestination = `${destination}/${backupName}`;

        if (!existsSync(destination)) {
            Logger.error(`The destination directory '${destination}' does not exist.`);
            process.exit(1);
        }
        if (existsSync(fullDestination)) {
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
            
            if (rawBackup.encrypted && !config.VB_ENCRYPTION_PASSPHRASE) {
                Logger.error("The backup is encrypted. You need to provide the passphrase to decrypt it.");
                process.exit(1);
            }

            Logger.log("Decrypting the backup...");

            const backup = BackupArchive.fromRaw(rawBackup, config.VB_ENCRYPTION_PASSPHRASE);
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

        } catch (e: any) {
            Logger.error(`Error downloading the backup: ${e.stack}`);
            process.exit(1);
        }
    }

}
