import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { S3Service } from "../src/services/s3-service.js";
import { ConfigHandler } from "../src/utils/configHandler.js";

describe("S3Service.fromConfig with s3rver", () => {
    let tempDir: string;

    beforeAll(() => {
        tempDir = mkdtempSync(join(tmpdir(), "lcmc-config-"));
    });

    afterAll(() => {
        rmSync(tempDir, { recursive: true, force: true });
    });

    test("connects and uploads through a config-constructed service", async () => {
        const config = ConfigHandler.getConfig()!;
        const s3 = S3Service.fromConfig(config);

        const fileName = `config-uploaded-${Date.now()}.bin`;
        const content = "uploaded via config service";
        const inputPath = join(tempDir, fileName);
        writeFileSync(inputPath, content);

        await s3.uploadBackupStream(fileName, inputPath);

        const response = await s3.listObjects();
        const keys = response.contents?.map(item => item.key) ?? [];
        expect(keys).toContain(fileName);
    });
});
