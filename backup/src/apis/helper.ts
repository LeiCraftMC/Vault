import { Logger } from "../logger";
import { LinuxShellAPI } from "./linux-shell";
import { existsSync } from "fs";

export class BackupHelper {

    static async getNewDBDump(cakeBin: string, webServerUser: string) {
        if (!existsSync(cakeBin)) {
            throw new Error("Invalid cakeBin path.");
        }
        if (!/^[a-z_][a-z0-9_-]*[$]?$/.test(webServerUser)) {
            throw new Error("Invalid webServerUser.");
        }
        
        const backupFileName = "passbolt_backup_" + Date.now() + ".sql";
        const backupFilePath = `/tmp/${backupFileName}`;

        const promise = Bun.$`su -s /bin/bash -c "${cakeBin} passbolt sql_export --dir /tmp --file ${backupFileName}" ${webServerUser}`;
        await LinuxShellAPI.handleExec(promise);
        Logger.debug(`DB dump saved to ${backupFilePath}`);

        if (!existsSync(backupFilePath)) {
            throw new Error("Failed to create backup file.");
        }

        Logger.debug(`Reading DB dump from ${backupFilePath}`);
        const fileContent = await LinuxShellAPI.getFile(backupFilePath);

        Logger.debug(`DB dump read successfully. Deleting dump file...`);
        await LinuxShellAPI.delFile(backupFilePath);
        Logger.debug(`DB dump file deleted.`);

        return fileContent;
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

        const path = `${this.basePath}/passbolt-backups-auto`;

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
        
        const path = `${this.basePath}/passbolt-backups-auto`;

        if (!existsSync(path)) {
            throw new Error("Cron job does not exist.");
        }

        await LinuxShellAPI.delFile(path);
        return true;
    }

}