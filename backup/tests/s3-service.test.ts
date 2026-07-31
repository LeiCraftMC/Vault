import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { S3Service } from "../src/services/s3-service.js";
import { BackupArchiveHeader, RawBackupArchive } from "../src/archive.js";
import { ConfigHandler } from "../src/utils/configHandler.js";
import { Uint, Uint64 } from "low-level";

function toUint8Array(buffer: Buffer): Uint8Array {
    return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

describe("S3Service with s3rver", () => {
    let s3: S3Service;
    let rootS3: S3Service;
    let basePath: string;
    let tempDir: string;

    beforeAll(() => {
        basePath = `s3-service-test/${Date.now()}-${Math.random().toString(36).slice(2, 8)}/`;
        const config = ConfigHandler.getConfig()!;
        s3 = new S3Service({
            endpoint: config.LCMC_VAULT_BACKUP_S3_ENDPOINT,
            region: config.LCMC_VAULT_BACKUP_S3_REGION,
            accessKeyId: config.LCMC_VAULT_BACKUP_S3_ACCESS_KEY_ID,
            secretAccessKey: config.LCMC_VAULT_BACKUP_S3_SECRET_ACCESS_KEY,
            bucket: config.LCMC_VAULT_BACKUP_S3_BUCKET,
            basePath,
        });
        rootS3 = S3Service.fromConfig(config);
        tempDir = mkdtempSync(join(tmpdir(), "lcmc-s3-service-"));
    });

    afterAll(() => {
        rmSync(tempDir, { recursive: true, force: true });
    });

    function createS3Service(extraBasePath?: string): S3Service {
        const config = ConfigHandler.getConfig()!;
        return new S3Service({
            endpoint: config.LCMC_VAULT_BACKUP_S3_ENDPOINT,
            region: config.LCMC_VAULT_BACKUP_S3_REGION,
            accessKeyId: config.LCMC_VAULT_BACKUP_S3_ACCESS_KEY_ID,
            secretAccessKey: config.LCMC_VAULT_BACKUP_S3_SECRET_ACCESS_KEY,
            bucket: config.LCMC_VAULT_BACKUP_S3_BUCKET,
            basePath: extraBasePath ?? basePath,
        });
    }

    function makeLocalFile(name: string, content: string): string {
        const filePath = join(tempDir, name);
        writeFileSync(filePath, content);
        return filePath;
    }

    function suffix(): string {
        return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }

    test("uploadBackup and downloadBackup roundtrip", async () => {
        const time = Uint64.from(Date.now());
        const content = Uint.from("fake tarball bytes", "utf8");
        const raw = new RawBackupArchive(new BackupArchiveHeader(time), false, content);

        await s3.uploadBackup(raw);

        const downloaded = await s3.downloadBackup(raw.header.getArchiveName());
        expect(downloaded).not.toBeNull();
        expect(downloaded!.header.time.toBigInt()).toBe(time.toBigInt());
        expect(Number(downloaded!.header.version)).toBe(1);
        expect(downloaded!.encrypted).toBe(false);
        expect(downloaded!.content.toString("utf8")).toBe("fake tarball bytes");
    });

    test("uploadBackupStream and downloadBackupToFile roundtrip", async () => {
        const name = `streamed-file-${suffix()}.bin`;
        const content = "streamed file content";
        const inputPath = makeLocalFile("stream-input.bin", content);
        const outputPath = join(tempDir, `stream-output-${suffix()}.bin`);

        await s3.uploadBackupStream(name, inputPath);
        await s3.downloadBackupToFile(name, outputPath);

        expect(toUint8Array(readFileSync(outputPath))).toEqual(toUint8Array(Buffer.from(content, "utf8")));
    });

    test("listObjects returns uploaded objects", async () => {
        const name = `listable-file-${suffix()}.bin`;
        const inputPath = makeLocalFile("list-input.bin", "list me");

        await s3.uploadBackupStream(name, inputPath);

        const response = await s3.listObjects();
        const keys = response.contents?.map(item => item.key) ?? [];
        expect(keys).toContain(`${basePath}${name}`);
    });

    test("deleteObject removes object", async () => {
        const name = `delete-me-${suffix()}.bin`;
        const inputPath = makeLocalFile("delete-input.bin", "delete me");

        await s3.uploadBackupStream(name, inputPath);
        await s3.deleteObject(`${basePath}${name}`);

        const response = await s3.listObjects();
        const keys = response.contents?.map(item => item.key) ?? [];
        expect(keys).not.toContain(`${basePath}${name}`);
    });

    test("basePath prefixes object keys", async () => {
        const extraBasePath = `${basePath}backups/${suffix()}/`;
        const prefixedS3 = createS3Service(extraBasePath);
        const name = `prefixed-file-${suffix()}.bin`;
        const inputPath = makeLocalFile("prefix-input.bin", "prefixed content");

        await prefixedS3.uploadBackupStream(name, inputPath);

        const response = await prefixedS3.listObjects();
        const keys = response.contents?.map(item => item.key) ?? [];
        expect(keys).toContain(`${extraBasePath}${name}`);

        const rootResponse = await rootS3.listObjects();
        const rootKeys = rootResponse.contents?.map(item => item.key) ?? [];
        expect(rootKeys).toContain(`${extraBasePath}${name}`);
    });

    test("downloadBackupToFile with basePath", async () => {
        const extraBasePath = `${basePath}nested/${suffix()}/`;
        const prefixedS3 = createS3Service(extraBasePath);
        const name = `nested-file-${suffix()}.bin`;
        const content = "nested content";
        const inputPath = makeLocalFile("nested-input.bin", content);
        const outputPath = join(tempDir, `nested-output-${suffix()}.bin`);

        await prefixedS3.uploadBackupStream(name, inputPath);
        await prefixedS3.downloadBackupToFile(name, outputPath);

        expect(toUint8Array(readFileSync(outputPath))).toEqual(toUint8Array(Buffer.from(content, "utf8")));
    });

    test("throws when downloading a non-existent object", async () => {
        await expect(s3.downloadBackup(`does-not-exist-${suffix()}.backup.tar.gz`)).rejects.toThrow();
    });
});
