import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { BackupArchiveHeader, RawBackupArchive } from "../src/archive.js";
import { Uint, Uint64 } from "low-level";
import { mkdtempSync, rmSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

describe("archive streaming", () => {

    let tempDir: string;

    beforeEach(() => {
        tempDir = mkdtempSync(join(tmpdir(), "lcmc-archive-stream-"));
    });

    afterEach(() => {
        rmSync(tempDir, { recursive: true, force: true });
    });

    function toUint8Array(buffer: Buffer): Uint8Array {
        return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    }

    test("stream_encode_decode_matches_in_memory_format", async () => {
        const time = Uint64.from(Date.now());
        const content = Uint.from("fake tar.gz bytes", "utf8");

        const inMemoryRaw = new RawBackupArchive(
            new BackupArchiveHeader(time),
            false,
            content
        );
        const inMemoryBytes = inMemoryRaw.encodeToHex().getRaw();

        const contentPath = join(tempDir, "content.bin");
        const archivePath = join(tempDir, "archive.bin");

        await Bun.write(contentPath, content.getRaw());
        await RawBackupArchive.encodeToFile(archivePath, new BackupArchiveHeader(time), false, contentPath);

        const fileBytes = readFileSync(archivePath);
        expect(toUint8Array(fileBytes)).toEqual(toUint8Array(inMemoryBytes));

        const decoded = await RawBackupArchive.decodeFromFile(archivePath);
        expect(Number(decoded.header.version)).toBe(1);
        expect(decoded.header.time.toBigInt()).toBe(time.toBigInt());
        expect(decoded.encrypted).toBe(false);
        expect(decoded.contentLength).toBe(content.getLen());
    });

    test("stream_decode_large_content", async () => {
        const time = Uint64.from(Date.now());
        const contentLength = 4 * 1024 * 1024;
        const content = Buffer.alloc(contentLength);
        for (let i = 0; i < content.length; i++) {
            content[i] = i % 256;
        }

        const contentPath = join(tempDir, "content.bin");
        const archivePath = join(tempDir, "archive.bin");

        await Bun.write(contentPath, content);
        await RawBackupArchive.encodeToFile(archivePath, new BackupArchiveHeader(time), true, contentPath);

        const decoded = await RawBackupArchive.decodeFromFile(archivePath);
        expect(decoded.encrypted).toBe(true);
        expect(decoded.contentLength).toBe(contentLength);
        expect(decoded.contentOffset).toBeGreaterThan(0);
    });

});
