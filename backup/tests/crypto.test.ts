import { describe, expect, test } from "bun:test"
import { AES256 } from "../src/crypto.js";
import { Uint, Uint64 } from "low-level";
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

        const tarball = Uint.from("fake tar.gz bytes", "utf8");

        const archive = BackupArchive.fromTarball(Uint64.from(Date.now()), tarball);

        const encryptedArchive = archive.encrypt(passphrase).encodeToHex();

        const decryptedArchive = BackupArchive.fromEncrypted(encryptedArchive, passphrase);

        expect(decryptedArchive).not.toBeNull();
        expect(JSON.stringify(decryptedArchive)).toEqual(JSON.stringify(archive));

    });

});
