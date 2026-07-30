import { Uint, Uint64 } from "low-level";
import { BackupArchive, BackupArchiveHeader } from "../src/archive.js";
import { describe, expect, test } from "bun:test"

describe("encoding_decoding", () => {

    test("header", () => {

        const header = new BackupArchiveHeader(Uint64.from(1234567890123));

        const hex = header.encodeToHex();
        const decoded = BackupArchiveHeader.fromDecodedHex(hex, true);
        if (!decoded) {
            throw new Error("Decoding failed");
        }

        expect(decoded.length).toBe(hex.getLen());
        expect(decoded.data.time.toBigInt()).toBe(1234567890123n);
        expect(Number(decoded.data.version)).toBe(1);

    });

    test("archive", () => {

        const tarball = Uint.from("fake tar.gz bytes", "utf8");

        const archive = BackupArchive.fromTarball(Uint64.from(Date.now()), tarball);

        const hex = archive.encodeToHex();
        const decoded = BackupArchive.fromDecodedHex(hex, true);
        if (!decoded) {
            throw new Error("Decoding failed");
        }

        expect(decoded.length).toBe(hex.getLen());
        expect(JSON.stringify(decoded.data)).toEqual(JSON.stringify(archive));
    });


});
