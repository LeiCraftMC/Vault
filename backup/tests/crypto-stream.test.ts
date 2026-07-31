import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { AES256 } from "../src/crypto.js";
import { Uint } from "low-level";
import { mkdtempSync, rmSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

describe("crypto streaming", () => {

    let tempDir: string;

    beforeEach(() => {
        tempDir = mkdtempSync(join(tmpdir(), "lcmc-crypto-stream-"));
    });

    afterEach(() => {
        rmSync(tempDir, { recursive: true, force: true });
    });

    function toUint8Array(buffer: Buffer): Uint8Array {
        return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    }

    test("stream_encrypt_decrypt_roundtrip", async () => {
        const passphrase = "correct horse battery staple";
        const plaintext = Buffer.alloc(2 * 1024 * 1024);
        for (let i = 0; i < plaintext.length; i++) {
            plaintext[i] = i % 256;
        }

        const inputPath = join(tempDir, "plaintext.bin");
        const encryptedPath = join(tempDir, "encrypted.bin");
        const outputPath = join(tempDir, "decrypted.bin");

        await Bun.write(inputPath, plaintext);

        await AES256.encryptFile(inputPath, encryptedPath, passphrase);
        const success = await AES256.decryptFile(encryptedPath, outputPath, passphrase);

        expect(success).toBe(true);
        expect(toUint8Array(readFileSync(outputPath))).toEqual(toUint8Array(plaintext));
    });

    test("stream_decrypt_with_wrong_passphrase_fails", async () => {
        const passphrase = "correct horse battery staple";
        const plaintext = Buffer.from("super secret backup data", "utf8");

        const inputPath = join(tempDir, "plaintext.bin");
        const encryptedPath = join(tempDir, "encrypted.bin");
        const outputPath = join(tempDir, "decrypted.bin");

        await Bun.write(inputPath, plaintext);
        await AES256.encryptFile(inputPath, encryptedPath, passphrase);

        const success = await AES256.decryptFile(encryptedPath, outputPath, "wrong passphrase");
        expect(success).toBe(false);
    });

    test("stream_format_matches_in_memory_format", async () => {
        const passphrase = "correct horse battery staple";
        const plaintext = Buffer.from("backup tarball bytes", "utf8");

        const inputPath = join(tempDir, "plaintext.bin");
        const encryptedPath = join(tempDir, "encrypted.bin");
        const decryptedPath = join(tempDir, "decrypted.bin");

        await Bun.write(inputPath, plaintext);
        await AES256.encryptFile(inputPath, encryptedPath, passphrase);

        const success = await AES256.decryptFile(encryptedPath, decryptedPath, passphrase);
        expect(success).toBe(true);
        expect(toUint8Array(readFileSync(decryptedPath))).toEqual(toUint8Array(plaintext));
    });

});
