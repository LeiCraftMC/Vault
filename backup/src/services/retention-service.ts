import { Logger } from "../utils/logger";
import { S3Service } from "./s3-service";

export interface BackupObject {
    key: string;
    lastModified: Date;
}

export interface RetentionDecision {
    keep: BackupObject[];
    delete: BackupObject[];
}

export interface RetentionConfig {
    retentionDays: number | undefined;
    minCount: number | undefined;
}

export interface RawRetentionConfig {
    retentionDays: string | undefined;
    minCount: string | undefined;
}

function parsePositiveInt(value: string | undefined, name: string): number | undefined {
    if (value === undefined || value.trim() === "") {
        return undefined;
    }
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        Logger.warn(`Invalid value '${value}' for ${name}; expected a positive integer. Ignoring retention setting.`);
        return undefined;
    }
    return parsed;
}

export class RetentionService {

    private static readonly ARCHIVE_NAME_REGEX = /^lcmc-vault-(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})\.backup\.tar\.gz$/;

    /**
     * Parses raw retention config strings into validated numbers.
     */
    static parseConfig(raw: RawRetentionConfig): RetentionConfig {
        return {
            retentionDays: parsePositiveInt(raw.retentionDays, "LCMC_VAULT_BACKUP_RETENTION_DAYS"),
            minCount: parsePositiveInt(raw.minCount, "LCMC_VAULT_BACKUP_RETENTION_MIN_COUNT")
        };
    }

    /**
     * Applies the configured retention policy to backups stored in S3.
     * Returns the list of keys that were deleted.
     */
    static async applyRetention(s3: S3Service, config: RetentionConfig): Promise<string[]> {
        const retentionDays = config.retentionDays;
        if (retentionDays === undefined || retentionDays <= 0) {
            Logger.debug("Retention cleanup is not configured (LCMC_VAULT_BACKUP_RETENTION_DAYS is unset or zero).");
            return [];
        }

        const minCount = Math.max(1, config.minCount ?? 1);
        const retentionMs = retentionDays * 24 * 60 * 60 * 1000;
        const now = Date.now();
        const cutoffTime = now - retentionMs;

        Logger.log(`Applying backup retention policy: delete backups older than ${retentionDays} days, keeping at least ${minCount} newest.`);

        const backups = await this.listBackups(s3);
        if (backups.length === 0) {
            Logger.debug("No backups found in S3; nothing to clean up.");
            return [];
        }

        const decision = this.decideRetention(backups, cutoffTime, minCount);

        if (decision.delete.length === 0) {
            Logger.log("No backups exceeded the retention policy.");
            return [];
        }

        Logger.log(`Deleting ${decision.delete.length} historical backup(s)...`);
        const deleted: string[] = [];

        for (const backup of decision.delete) {
            try {
                Logger.debug(`Deleting backup '${backup.key}'...`);
                await s3.deleteObject(backup.key);
                Logger.log(`Deleted historical backup '${backup.key}'.`);
                deleted.push(backup.key);
            } catch (e: any) {
                Logger.warn(`Failed to delete historical backup '${backup.key}': ${Error.isError(e) ? e.message : String(e)}`);
            }
        }

        Logger.log(`Retention cleanup complete. Kept ${decision.keep.length} backup(s), deleted ${deleted.length}.`);
        return deleted;
    }

    /**
     * Lists backups in S3 and returns objects whose names match the archive pattern.
     */
    static async listBackups(s3: S3Service): Promise<BackupObject[]> {
        const response = await s3.listObjects();
        const contents = response.contents ?? [];
        const backups: BackupObject[] = [];

        for (const item of contents) {
            const key = item.key;
            const parsedName = this.parseArchiveName(key);
            if (!parsedName) {
                Logger.debug(`Skipping non-backup object '${key}' during retention cleanup.`);
                continue;
            }

            backups.push({
                key,
                lastModified: parsedName.date
            });
        }

        return backups.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
    }

    /**
     * Parses an S3 object key into a backup object if it matches the archive name pattern.
     * The base path prefix is stripped before matching.
     */
    static parseArchiveName(key: string): { date: Date } | null {
        const name = key.includes("/") ? key.slice(key.lastIndexOf("/") + 1) : key;
        const match = name.match(this.ARCHIVE_NAME_REGEX);
        if (!match) {
            return null;
        }

        const [_, yearStr, monthStr, dayStr, hourStr, minuteStr, secondStr] = match;
        const year = Number(yearStr);
        const month = Number(monthStr);
        const day = Number(dayStr);
        const hour = Number(hourStr);
        const minute = Number(minuteStr);
        const second = Number(secondStr);

        if (
            month < 1 || month > 12 ||
            day < 1 || day > 31 ||
            hour > 23 ||
            minute > 59 ||
            second > 59
        ) {
            return null;
        }

        const date = new Date(year, month - 1, day, hour, minute, second);

        if (isNaN(date.getTime())) {
            return null;
        }

        return { date };
    }

    /**
     * Decides which backups to keep and which to delete based on the retention cutoff
     * and the minimum number of backups to preserve.
     */
    static decideRetention(
        backups: BackupObject[],
        cutoffTime: number,
        minCount: number
    ): RetentionDecision {
        const sorted = backups.slice().sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());

        const keep: BackupObject[] = [];
        const toDelete: BackupObject[] = [];

        for (let i = 0; i < sorted.length; i++) {
            const backup = sorted[i]!;
            const isNewEnough = backup.lastModified.getTime() >= cutoffTime;
            const isWithinMinCount = i < minCount;

            if (isWithinMinCount || isNewEnough) {
                keep.push(backup);
            } else {
                toDelete.push(backup);
            }
        }

        return { keep, delete: toDelete };
    }

}
