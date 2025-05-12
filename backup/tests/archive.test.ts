import { Uint, Uint64 } from "low-level";
import { SingleFile, BackupArchive } from "../src/archive.js";
import { describe, expect, test } from "bun:test"
import { UTCDate } from "@date-fns/utc";

describe("encoding_decoding", () => {

    test("single_file", () => {

        const file = new SingleFile("path/to/file.txt", Uint.from("one line\nanother line", "utf8"));

        const hex = file.encodeToHex();
        const decoded = SingleFile.fromDecodedHex(hex, true);
        if (!decoded) {
            throw new Error("Decoding failed");
        }

        expect(decoded.length).toBe(hex.getLen());

        expect(decoded.data.path).toBe("path/to/file.txt");
        expect(decoded.data.content.toString()).toBe("one line\nanother line");

    });

    test("archive", () => {

        const files = {
            "path/to/file1.txt": "file 1 content",
            "path/to/file2.txt": "file 2 content",
            "path/to/file3.txt": "file 3 content",
        };

        const archive = BackupArchive.fromFileList(Uint64.from(new UTCDate().getTime()), files);

        const hex = archive.encodeToHex();
        const decoded = BackupArchive.fromDecodedHex(hex, true);
        if (!decoded) {
            throw new Error("Decoding failed");
        }

        expect(decoded.length).toBe(hex.getLen());
        expect(JSON.stringify(decoded.data)).toEqual(JSON.stringify(archive));
    });


});

