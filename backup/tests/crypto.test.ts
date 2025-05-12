import { describe, expect, test } from "bun:test"
import { AES256 } from "../src/crypto.js";
import { Uint, Uint64 } from "low-level";
import { UTCDate } from "@date-fns/utc";
import { BackupArchive } from "../src/archive.js";

describe("crypto", () => {

    test("test_aes256", () => {

        const passphrase = "password";
        const plaintext = "Hello, World!";

        const ciphertext = AES256.encrypt(Uint.from(plaintext, "utf8"), passphrase);
        const decrypted = AES256.decrypt(ciphertext, passphrase);

        expect(decrypted).not.toBeNull();
        expect((decrypted as Uint).toString("utf8")).toEqual("Hello, World!");

    });

    test("encrypt_archive", () => {

        const passphrase = "password";

        const files = {
            "path/to/file1.txt": "file 1 content",
            "path/to/file2.txt": "file 2 content",
            "path/to/file3.txt": "file 3 content",
        };

        const archive = BackupArchive.fromFileList(Uint64.from(new UTCDate().getTime()), files);

        const encryptedArchive = archive.encrypt(passphrase).encodeToHex();

        const decryptedArchive = BackupArchive.fromEncrypted(encryptedArchive, passphrase);

        expect(decryptedArchive).not.toBeNull();
        expect(JSON.stringify(decryptedArchive)).toEqual(JSON.stringify(archive));

    });

});