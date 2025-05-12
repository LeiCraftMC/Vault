import { CLICMD, CLISubCMD } from "@cleverjs/cli";
import { Utils } from "../utils";
import { CronHelper } from "../apis/helper";
import { Logger } from "../logger.js";

export class CronCMD extends CLISubCMD {

    readonly name = "cron";
    readonly description = "Cron job for automatic backup creation.";
    readonly usage = "cron (setup | delete) [--config=<path_to_env>] [...args]";

    protected onInit(): void | Promise<void> {
        this.register(new CronSetupCMD());
        this.register(new CronDeleteCMD());
    }

}

class CronSetupCMD extends CLICMD {
    readonly name = "setup";
    readonly description = "Setup cron job for automatic backup creation.";
    readonly usage = "setup <cron_time> [<bin_path>] [<custom_env>]";

    async run(args: string[]) {
        Logger.log("Setting up cron job...");

        if (args.length > 2) {
            Logger.error("You have to specify the backup name and the destination directory.");
            process.exit(1);
        }

        const cronTime = args[0] || "0 0 * * *";
        const binPath = args[1] || "/usr/local/bin/vault-backups";
        const customENV = args[2];

        const create_result = await CronHelper.createCronJob(cronTime, binPath, customENV, true);

        if (create_result) {
            Logger.log("Cron job created successfully.");
        } else {
            Logger.error("Failed to create cron job.");
        }
    }

}

class CronDeleteCMD extends CLICMD {
    readonly name = "delete";
    readonly description = "Delete cron job for automatic backup creation.";
    readonly usage = "delete [--config=<path_to_env>]";

    async run(args: string[]) {
        Logger.log("Deleting cron job...");

        const result = await CronHelper.deleteCronJob();
        if (result) {
            Logger.log("Cron job deleted successfully.");
        } else {
            Logger.error("Failed to delete cron job.");
        }
    }

}
