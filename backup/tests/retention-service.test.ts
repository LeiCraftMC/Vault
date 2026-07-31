import { describe, expect, test } from "bun:test";
import { RetentionService } from "../src/services/retention-service.js";
import type { BackupObject } from "../src/services/retention-service.js";

describe("RetentionService.parseArchiveName", () => {

    test("parses_valid_archive_name", () => {
        const result = RetentionService.parseArchiveName("lcmc-vault-2026-07-31_12-30-45.backup.tar.gz");
        expect(result).not.toBeNull();
        expect(result!.date.toISOString()).toBe("2026-07-31T12:30:45.000Z");
    });

    test("strips_base_path_before_matching", () => {
        const result = RetentionService.parseArchiveName("backups/lcmc-vault-2026-07-31_12-30-45.backup.tar.gz");
        expect(result).not.toBeNull();
        expect(result!.date.toISOString()).toBe("2026-07-31T12:30:45.000Z");
    });

    test("returns_null_for_unrelated_objects", () => {
        expect(RetentionService.parseArchiveName("random-file.txt")).toBeNull();
        expect(RetentionService.parseArchiveName("lcmc-vault-2026-07-31_12-30-45.tar.gz")).toBeNull();
        expect(RetentionService.parseArchiveName("prefix-lcmc-vault-2026-07-31_12-30-45.backup.tar.gz")).toBeNull();
    });

    test("returns_null_for_invalid_dates", () => {
        expect(RetentionService.parseArchiveName("lcmc-vault-2026-13-31_12-30-45.backup.tar.gz")).toBeNull();
    });

});

describe("RetentionService.decideRetention", () => {

    function makeBackup(key: string, date: Date): BackupObject {
        return { key, lastModified: date };
    }

    const now = new Date("2026-07-31T12:00:00.000Z").getTime();

    test("keeps_recent_backups_within_retention_window", () => {
        const backups = [
            makeBackup("a", new Date(now - 1 * 24 * 60 * 60 * 1000)),
            makeBackup("b", new Date(now - 2 * 24 * 60 * 60 * 1000)),
            makeBackup("c", new Date(now - 5 * 24 * 60 * 60 * 1000)),
        ];

        const decision = RetentionService.decideRetention(backups, now - 3 * 24 * 60 * 60 * 1000, 1);
        expect(decision.keep.map(b => b.key)).toEqual(["a", "b"]);
        expect(decision.delete.map(b => b.key)).toEqual(["c"]);
    });

    test("always_keeps_minimum_count_even_if_older_than_retention", () => {
        const backups = [
            makeBackup("a", new Date(now - 10 * 24 * 60 * 60 * 1000)),
            makeBackup("b", new Date(now - 20 * 24 * 60 * 60 * 1000)),
            makeBackup("c", new Date(now - 30 * 24 * 60 * 60 * 1000)),
        ];

        const decision = RetentionService.decideRetention(backups, now - 5 * 24 * 60 * 60 * 1000, 2);
        expect(decision.keep.map(b => b.key)).toEqual(["a", "b"]);
        expect(decision.delete.map(b => b.key)).toEqual(["c"]);
    });

    test("keeps_all_backups_when_none_are_old_enough_to_delete", () => {
        const backups = [
            makeBackup("a", new Date(now - 1 * 24 * 60 * 60 * 1000)),
            makeBackup("b", new Date(now - 2 * 24 * 60 * 60 * 1000)),
        ];

        const decision = RetentionService.decideRetention(backups, now - 5 * 24 * 60 * 60 * 1000, 1);
        expect(decision.keep.map(b => b.key)).toEqual(["a", "b"]);
        expect(decision.delete).toBeEmpty();
    });

    test("sorts_unsorted_input_by_date_descending", () => {
        const backups = [
            makeBackup("old", new Date(now - 5 * 24 * 60 * 60 * 1000)),
            makeBackup("new", new Date(now - 1 * 24 * 60 * 60 * 1000)),
        ];

        const decision = RetentionService.decideRetention(backups, now - 3 * 24 * 60 * 60 * 1000, 1);
        expect(decision.keep.map(b => b.key)).toEqual(["new"]);
        expect(decision.delete.map(b => b.key)).toEqual(["old"]);
    });

    test("keeps_everything_when_minimum_count_exceeds_total_backups", () => {
        const backups = [
            makeBackup("a", new Date(now - 10 * 24 * 60 * 60 * 1000)),
            makeBackup("b", new Date(now - 20 * 24 * 60 * 60 * 1000)),
        ];

        const decision = RetentionService.decideRetention(backups, now - 5 * 24 * 60 * 60 * 1000, 5);
        expect(decision.keep.map(b => b.key)).toEqual(["a", "b"]);
        expect(decision.delete).toBeEmpty();
    });

});

describe("RetentionService.parseConfig", () => {

    test("parses_valid_positive_integers", () => {
        const config = RetentionService.parseConfig({
            retentionDays: "30",
            minCount: "5"
        });
        expect(config.retentionDays).toBe(30);
        expect(config.minCount).toBe(5);
    });

    test("returns_undefined_for_unset_values", () => {
        const config = RetentionService.parseConfig({
            retentionDays: undefined,
            minCount: undefined
        });
        expect(config.retentionDays).toBeUndefined();
        expect(config.minCount).toBeUndefined();
    });

    test("returns_undefined_for_invalid_values", () => {
        expect(RetentionService.parseConfig({ retentionDays: "0", minCount: undefined }).retentionDays).toBeUndefined();
        expect(RetentionService.parseConfig({ retentionDays: "-5", minCount: undefined }).retentionDays).toBeUndefined();
        expect(RetentionService.parseConfig({ retentionDays: "abc", minCount: undefined }).retentionDays).toBeUndefined();
        expect(RetentionService.parseConfig({ retentionDays: "30", minCount: "0" }).minCount).toBeUndefined();
    });

});
