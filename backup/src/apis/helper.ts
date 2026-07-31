import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { readdir } from "fs/promises";
import { Logger } from "../utils/logger";
import { LinuxShellAPI } from "./linux-shell";
import { join, dirname } from "path";

export type DatabaseBackupMethod = "auto" | "vaultwarden" | "sqlite3" | "none";

export class BackupHelper {

    /**
     * Creates a safe SQLite database snapshot.
     * Tries the vaultwarden built-in command first, then falls back to sqlite3.
     * Returns the absolute path to the snapshot file.
     */
    static async createDatabaseSnapshot(dbPath: string, method: DatabaseBackupMethod = "auto"): Promise<string | null> {
        const dataDir = dirname(dbPath);

        if (method === "none") {
            Logger.debug("Skipping database snapshot (method=none).");
            return null;
        }

        if (method === "auto" || method === "vaultwarden") {
            try {
                Logger.debug("Trying to create database snapshot using /vaultwarden backup...");
                await LinuxShellAPI.exec(["/vaultwarden", "backup"]);
                Logger.debug("Vaultwarden backup command executed successfully.");

                // /vaultwarden backup writes db_YYYYMMDD_HHMMSS.sqlite3 into the data directory.
                const backups = await this.findVaultwardenBackups(dataDir);
                if (backups.length > 0) {
                    const latest = backups.sort().at(-1)!;
                    Logger.debug(`Found vaultwarden backup file: ${latest}`);
                    return latest;
                }

                if (method === "vaultwarden") {
                    throw new Error("Vaultwarden backup command succeeded but no backup file was found.");
                }
                Logger.warn("Vaultwarden backup did not produce a file, falling back to sqlite3.");
            } catch (e: any) {
                if (method === "vaultwarden") {
                    throw new Error(`Vaultwarden backup failed: ${e.message}`);
                }
                Logger.warn(`Vaultwarden backup failed: ${e.message}. Falling back to sqlite3.`);
            }
        }

        if (!await LinuxShellAPI.commandExists("sqlite3")) {
            throw new Error("Neither /vaultwarden backup nor sqlite3 is available. Cannot safely snapshot the database.");
        }

        const snapshotPath = join(dataDir, `db_snapshot_${Date.now()}.sqlite3`);
        Logger.debug(`Creating database snapshot with sqlite3 at ${snapshotPath}...`);
        await LinuxShellAPI.exec(["sqlite3", dbPath, `.backup '${snapshotPath}'`]);

        if (!existsSync(snapshotPath)) {
            throw new Error("sqlite3 snapshot command completed but snapshot file was not created.");
        }

        Logger.debug(`Database snapshot created at ${snapshotPath}.`);
        return snapshotPath;
    }

    private static async findVaultwardenBackups(dataDir: string): Promise<string[]> {
        const pattern = /^db_\d{8}_\d{6}\.sqlite3$/;
        const backups: string[] = [];

        if (!existsSync(dataDir)) return [];
        for (const entry of await readdir(dataDir, { withFileTypes: true })) {
            if (entry.isFile() && pattern.test(entry.name)) {
                backups.push(join(dataDir, entry.name));
            }
        }
        return backups;
    }

    /**
     * Creates a gzip-compressed tar archive of the Vaultwarden data directory,
     * substituting a safe database snapshot for the live database files.
     */
    static async createTarball(
        dataDir: string,
        snapshotPath: string | null,
        envContent?: string
    ): Promise<Uint8Array> {
        if (!existsSync(dataDir)) {
            throw new Error(`Vaultwarden data directory ${dataDir} does not exist.`);
        }

        const workDir = `/tmp/lcmc-vault-backup-${Date.now()}`;
        const stagingDir = join(workDir, "data");
        mkdirSync(stagingDir, { recursive: true });

        try {
            // Copy the whole data directory, skipping the live SQLite files.
            Logger.debug(`Staging data directory ${dataDir}...`);
            await this.copyDirectory(dataDir, stagingDir, [
                "db.sqlite3",
                "db.sqlite3-wal",
                "db.sqlite3-shm",
                "icon_cache"
            ]);

            // Replace db.sqlite3 with the clean snapshot.
            if (snapshotPath) {
                const targetDb = join(stagingDir, "db.sqlite3");
                await Bun.write(targetDb, Bun.file(snapshotPath));
                Logger.debug("Replaced live db.sqlite3 with snapshot.");
            }

            // Append env file if requested.
            if (envContent !== undefined) {
                const envPath = join(workDir, "backup.env");
                writeFileSync(envPath, envContent, { mode: 0o600 });
                Logger.debug("Staged environment backup file.");
            }

            // Build tar.gz.
            const tarballPath = join(workDir, "backup.tar.gz");
            const tarArgs = ["-czf", tarballPath];
            if (envContent !== undefined) {
                tarArgs.push("-C", workDir, "data", "backup.env");
            } else {
                tarArgs.push("-C", workDir, "data");
            }
            Logger.debug(`Creating tar.gz archive at ${tarballPath}...`);
            await LinuxShellAPI.exec(["tar", ...tarArgs]);

            if (!existsSync(tarballPath)) {
                throw new Error("tar command completed but archive was not created.");
            }

            const bytes = await Bun.file(tarballPath).bytes();
            Logger.debug(`Tar.gz archive created (${bytes.length} bytes).`);
            return bytes;
        } finally {
            rmSync(workDir, { recursive: true, force: true });
            Logger.debug(`Cleaned up working directory ${workDir}.`);
        }
    }

    private static async copyDirectory(src: string, dest: string, excludeNames: string[]) {
        const entries = await readdir(src, { withFileTypes: true });
        for (const entry of entries) {
            if (excludeNames.includes(entry.name)) continue;

            const srcPath = join(src, entry.name);
            const destPath = join(dest, entry.name);

            if (entry.isDirectory()) {
                mkdirSync(destPath, { recursive: true });
                await this.copyDirectory(srcPath, destPath, excludeNames);
            } else {
                await Bun.write(destPath, Bun.file(srcPath));
            }
        }
    }

}


export class CronHelper {

    private static basePath = "/etc/cron.d";

    private static readonly CRON_REGEX =
        /^(\*|([0-5]?\d)|([0-5]?\d-[0-5]?\d)|(\*\/[0-9]+)|([0-5]?\d(,[0-5]?\d)*))\s+(\*|([01]?\d|2[0-3])|([01]?\d|2[0-3]-[01]?\d|2[0-3])|(\*\/[0-9]+)|([01]?\d|2[0-3](,[01]?\d|2[0-3])*))\s+(\*|([1-9]|[12]\d|3[01])|([1-9]|[12]\d|3[01]-[1-9]|[12]\d|3[01])|(\*\/[0-9]+)|([1-9]|[12]\d|3[01](,[1-9]|[12]\d|3[01])*))\s+(\*|([1-9]|1[0-2])|([1-9]|1[0-2]-[1-9]|1[0-2])|(\*\/[0-9]+)|([1-9]|1[0-2](,[1-9]|1[0-2])*))\s+(\*|([0-6])|([0-6]-[0-6])|(\*\/[0-9]+)|([0-6](,[0-6])*))$/;


    static async createCronJob(cronTime: string, binPath: string, customENV?: string | null, override: boolean = false) {

        if (!this.CRON_REGEX.test(cronTime)) {
            throw new Error("Invalid cron time format.");
        }

        const path = `${this.basePath}/lcmc-vault-backups-auto`;

        if (existsSync(path) && !override) {
            throw new Error("Cron job already exists.");
        }

        if (!existsSync(binPath)) {
            throw new Error("Invalid binPath.");
        }

        if (customENV && !existsSync(customENV)) {
            throw new Error("Invalid customENV path.");
        }

        let cronJob = `PATH=/bin:/usr/local/bin:/usr/bin\n\n` +
            `${cronTime} root /bin/bash -c ". /etc/environment && ${binPath} create --as-cron ${customENV ? "--config=" + customENV : ""}" >/proc/1/fd/1 2>&1\n`;

        await Bun.write(path, cronJob, { mode: 0o644 });
        return true;
    }

    static async deleteCronJob() {

        const path = `${this.basePath}/lcmc-vault-backups-auto`;

        if (!existsSync(path)) {
            throw new Error("Cron job does not exist.");
        }

        await LinuxShellAPI.delFile(path);
        return true;
    }

}
