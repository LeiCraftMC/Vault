import { CLIBaseCommand, CLICommandArg, CLICommandArgParser, CLICommandContext } from "@cleverjs/cli";
import { Utils } from "../utils/index";
import { S3Service } from "../s3-service";
import { RawBackupArchive } from "../archive";
import { AES256 } from "../crypto";
import { Logger } from "../utils/logger";
import { ConfigHandler } from "../utils/configHandler";
import { mkdir, open } from "fs/promises";

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
            description: "Downloads a backup from the S3 bucket and extracts it into the given directory.",
            args: CMD_ARG_SPEC
        });
    }

    readonly name = "download";
    readonly description = "Downloads a backup from the S3 bucket and extracts it into the given directory.";

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

        const workDir = `/tmp/lcmc-vault-restore-${Date.now()}`;
        const archivePath = `${workDir}/archive.lcmc`;
        const contentPath = `${workDir}/content.bin`;
        const tarballPath = `${workDir}/backup.tar.gz`;

        try {
            await mkdir(workDir, { recursive: true });
            await s3.downloadBackupToFile(backupName, archivePath);
            Logger.log(`Downloaded backup '${backupName}' from S3.`);

            Logger.log("Reading backup archive envelope...");
            const archiveInfo = await RawBackupArchive.decodeFromFile(archivePath);

            if (archiveInfo.encrypted && !config.LCMC_VAULT_BACKUP_ENCRYPTION_PASSPHRASE) {
                Logger.error("The backup is encrypted. You need to provide the passphrase to decrypt it.");
                process.exit(1);
            }

            // Split the content bytes out of the raw archive file.
            await this.splitFileSection(archivePath, archiveInfo.contentOffset, archiveInfo.contentLength, contentPath);

            Logger.log("Decrypting the backup...");
            let finalTarballPath: string;
            if (archiveInfo.encrypted) {
                const decrypted = await AES256.decryptFile(contentPath, tarballPath, config.LCMC_VAULT_BACKUP_ENCRYPTION_PASSPHRASE!);
                if (!decrypted) {
                    Logger.error("The backup is corrupted or not a valid backup file.");
                    Logger.error("Could not decrypt the backup. Make sure you are using the correct passphrase.");
                    process.exit(1);
                }
                finalTarballPath = tarballPath;
            } else {
                finalTarballPath = contentPath;
            }

            Logger.log("Extracting the backup...");
            await mkdir(fullDestination, { recursive: true });
            const tarResult = Bun.$`tar -xzf ${finalTarballPath} -C ${fullDestination}`.quiet();
            const result = await tarResult;
            if (result.exitCode !== 0) {
                Logger.error(`Failed to extract backup: ${result.stderr.toString()}`);
                process.exit(1);
            }

            Logger.log(`Backup '${backupName}' downloaded and extracted successfully to '${fullDestination}'.`);
            Logger.warn("Before starting Vaultwarden with restored data, stop it and delete any existing db.sqlite3-wal file next to db.sqlite3 to avoid corruption.");

            return true;
        } catch (e: any) {
            Logger.error(`Error downloading the backup: ${e.stack}`);
            return false;
        } finally {
            await Bun.$`rm -rf ${workDir}`.quiet().catch(() => {});
        }
    }

    private async splitFileSection(inputPath: string, offset: number, length: number, outputPath: string) {
        const input = await open(inputPath, "r");
        try {
            const output = Bun.file(outputPath).writer();
            const bufferSize = 64 * 1024;
            const buffer = new Uint8Array(bufferSize);
            let remaining = length;
            let position = offset;

            while (remaining > 0) {
                const toRead = Math.min(bufferSize, remaining);
                const readResult = await input.read(buffer, 0, toRead, position);
                if (readResult.bytesRead === 0) {
                    throw new Error("Unexpected end of archive file while splitting content section");
                }
                await output.write(buffer.subarray(0, readResult.bytesRead));
                position += readResult.bytesRead;
                remaining -= readResult.bytesRead;
            }

            await output.end();
        } finally {
            await input.close();
        }
    }
}
