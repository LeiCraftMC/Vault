import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { S3Service } from "../src/services/s3-service.js";
import { RetentionService } from "../src/services/retention-service.js";
import { ConfigHandler } from "../src/utils/configHandler.js";

function archiveName(date: Date): string {
    const pad = (num: number) => String(num).padStart(2, "0");
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    const seconds = pad(date.getSeconds());
    return `lcmc-vault-${year}-${month}-${day}_${hours}-${minutes}-${seconds}.backup.tar.gz`;
}

describe("RetentionService with s3rver", () => {
    let tempDir: string;
    let rootBasePath: string;

    beforeAll(() => {
        tempDir = mkdtempSync(join(tmpdir(), "lcmc-retention-"));
        rootBasePath = `retention-test/${Date.now()}-${Math.random().toString(36).slice(2, 8)}/`;
    });

    afterAll(() => {
        rmSync(tempDir, { recursive: true, force: true });
    });

    function createS3Service(basePath: string): S3Service {
        const config = ConfigHandler.getConfig()!;
        return new S3Service({
            endpoint: config.LCMC_VAULT_BACKUP_S3_ENDPOINT,
            region: config.LCMC_VAULT_BACKUP_S3_REGION,
            accessKeyId: config.LCMC_VAULT_BACKUP_S3_ACCESS_KEY_ID,
            secretAccessKey: config.LCMC_VAULT_BACKUP_S3_SECRET_ACCESS_KEY,
            bucket: config.LCMC_VAULT_BACKUP_S3_BUCKET,
            basePath,
        });
    }

    async function seedBackup(basePath: string, date: Date): Promise<string> {
        const s3 = createS3Service(basePath);
        const name = archiveName(date);
        const filePath = join(tempDir, name);
        writeFileSync(filePath, "dummy backup content");
        await s3.uploadBackupStream(name, filePath);
        return `${basePath}${name}`;
    }

    function testBasePath(): string {
        return `${rootBasePath}${Date.now()}-${Math.random().toString(36).slice(2, 8)}/`;
    }

    test("deletes backups older than retentionDays keeping minCount newest", async () => {
        const basePath = testBasePath();
        const s3 = createS3Service(basePath);
        const now = new Date();
        const oneDayAgo = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);
        const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
        const twentyDaysAgo = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000);

        const keyRecent = await seedBackup(basePath, now);
        const key1Day = await seedBackup(basePath, oneDayAgo);
        const key10Day = await seedBackup(basePath, tenDaysAgo);
        const key20Day = await seedBackup(basePath, twentyDaysAgo);

        const deleted = await RetentionService.applyRetention(s3, { retentionDays: 7, minCount: 2 });

        expect(deleted.sort()).toEqual([key10Day, key20Day].sort());

        const remaining = await s3.listObjects();
        const keys = remaining.contents?.map(item => item.key) ?? [];
        expect(keys).toContain(keyRecent);
        expect(keys).toContain(key1Day);
        expect(keys).not.toContain(key10Day);
        expect(keys).not.toContain(key20Day);
    });

    test("always keeps at least minCount backups even if all are old", async () => {
        const basePath = testBasePath();
        const s3 = createS3Service(basePath);
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const fortyDaysAgo = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000);
        const fiftyDaysAgo = new Date(now.getTime() - 50 * 24 * 60 * 60 * 1000);

        const key30 = await seedBackup(basePath, thirtyDaysAgo);
        const key40 = await seedBackup(basePath, fortyDaysAgo);
        const key50 = await seedBackup(basePath, fiftyDaysAgo);

        const deleted = await RetentionService.applyRetention(s3, { retentionDays: 7, minCount: 2 });

        expect(deleted.sort()).toEqual([key50].sort());

        const remaining = await s3.listObjects();
        const keys = remaining.contents?.map(item => item.key) ?? [];
        expect(keys).toContain(key30);
        expect(keys).toContain(key40);
        expect(keys).not.toContain(key50);
    });

    test("ignores non-backup objects during cleanup", async () => {
        const basePath = testBasePath();
        const s3 = createS3Service(basePath);
        const now = new Date();
        const old = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const older = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000);

        const backupKey = await seedBackup(basePath, old);
        const olderBackupKey = await seedBackup(basePath, older);
        const otherKey = `random-file-${Date.now()}.txt`;
        const otherPath = join(tempDir, otherKey);
        writeFileSync(otherPath, "not a backup");
        await s3.uploadBackupStream(otherKey, otherPath);

        const deleted = await RetentionService.applyRetention(s3, { retentionDays: 7, minCount: 1 });

        expect(deleted).toContain(olderBackupKey);
        expect(deleted).not.toContain(backupKey);
        expect(deleted).not.toContain(`${basePath}${otherKey}`);

        const remaining = await s3.listObjects();
        const keys = remaining.contents?.map(item => item.key) ?? [];
        expect(keys).not.toContain(olderBackupKey);
        expect(keys).toContain(backupKey);
        expect(keys).toContain(`${basePath}${otherKey}`);
    });

    test("applies retention with a nested basePath prefix", async () => {
        const basePath = testBasePath();
        const nestedBasePath = `${basePath}nested/`;
        const s3 = createS3Service(nestedBasePath);
        const now = new Date();
        const old = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const older = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000);

        const backupKey = await seedBackup(nestedBasePath, old);
        const olderBackupKey = await seedBackup(nestedBasePath, older);

        const deleted = await RetentionService.applyRetention(s3, { retentionDays: 7, minCount: 1 });

        expect(deleted).toContain(olderBackupKey);
        expect(deleted).not.toContain(backupKey);

        const remaining = await s3.listObjects();
        const keys = remaining.contents?.map(item => item.key) ?? [];
        expect(keys).not.toContain(olderBackupKey);
        expect(keys).toContain(backupKey);
    });

    test("returns empty array when retentionDays is not configured", async () => {
        const basePath = testBasePath();
        const s3 = createS3Service(basePath);
        const now = new Date();
        const old = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        await seedBackup(basePath, old);

        const deleted = await RetentionService.applyRetention(s3, { retentionDays: undefined, minCount: 1 });
        expect(deleted).toBeEmpty();
    });
});
