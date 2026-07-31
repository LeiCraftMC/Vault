import { S3Client } from "bun";
import { RawBackupArchive } from "../archive";
import { Uint } from "low-level";
import type { ParsedConfig } from "../utils/configHandler";

export class S3Service {

    protected readonly client: S3Client;
    protected readonly basePath: string = "";

    /**
     * Constructs a new instance of the `S3Service` class.
     *
     * @param options - Configuration options for the S3Service.
     * @param options.endpoint - The endpoint URL of the S3-compatible storage service.
     * @param options.accessKeyId - The access key ID for authentication with the storage service.
     * @param options.secretAccessKey - The secret access key for authentication with the storage service.
     * @param options.bucket - (Optional) The name of the bucket to use for storing backups.
     * @param options.basePath - (Optional) The base path within the bucket where backups will be stored. Should be in format `path/to/folder/`.
     */
    constructor(options: {
        endpoint: string,
        accessKeyId: string,
        secretAccessKey: string,
        bucket?: string,
        basePath?: string
    }) {
        this.client = new S3Client(options);

        if (options.basePath) {
            if (!options.basePath.endsWith("/")) {
                options.basePath = options.basePath + "/";
            }
            if (options.basePath.startsWith("/")) {
                options.basePath = options.basePath.replace(/^\//, "");
            }
            if (options.basePath.length > 0) {
                this.basePath = options.basePath;
            }
        }
    }

    static fromConfig(config: ParsedConfig) {
        return new S3Service({
            endpoint: config.LCMC_VAULT_BACKUP_S3_ENDPOINT,
            accessKeyId: config.LCMC_VAULT_BACKUP_S3_ACCESS_KEY_ID,
            secretAccessKey: config.LCMC_VAULT_BACKUP_S3_SECRET_ACCESS_KEY,
            bucket: config.LCMC_VAULT_BACKUP_S3_BUCKET,
            basePath: config.LCMC_VAULT_BACKUP_S3_BASE_PATH
        });
    }

    async uploadBackup(rawBackup: RawBackupArchive) {
        const file = this.client.file(this.basePath + rawBackup.header.getArchiveName());
        return await file.write(rawBackup.encodeToHex().getRaw());
    }

    /**
     * Streams a local file to S3 without loading it into memory.
     */
    async uploadBackupStream(name: string, inputPath: string) {
        const file = this.client.file(this.basePath + name);
        return await file.write(Bun.file(inputPath));
    }

    async downloadBackup(name: string) {
        const file = await this.client.file(this.basePath + name).bytes();
        return RawBackupArchive.fromDecodedHex(Uint.from(file));
    }

    /**
     * Streams a backup from S3 into a local file without loading it into memory.
     */
    async downloadBackupToFile(name: string, outputPath: string) {
        const s3File = this.client.file(this.basePath + name);
        const stream = s3File.stream();
        await Bun.write(outputPath, new Response(stream));
    }

    /**
     * Lists objects in the bucket under the configured base path.
     */
    async listObjects(prefix?: string) {
        return await this.client.list({
            prefix: prefix ?? this.basePath
        });
    }

    /**
     * Deletes an object from S3 by its full key (including base path if applicable).
     */
    async deleteObject(key: string) {
        await this.client.unlink(key);
    }
}
