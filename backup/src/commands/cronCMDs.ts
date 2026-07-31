import { Utils } from "../utils/index";
import { CronHelper } from "../apis/helper";
import { Logger } from "../utils/logger";
import { CLIBaseCommand, CLICommandArg, CLICommandArgParser, CLICommandContext, CLISubCommandGroup } from "@cleverjs/cli";

export class CronCMD extends CLISubCommandGroup {

    constructor() {
        super({
            name: "cron",
            description: "Manage cron jobs for automatic backup creation."
        });
        this.register(new CronSetupCMD());
        this.register(new CronDeleteCMD());
    }

}

const CRON_SETUP_CMD_ARG_SPEC = CLICommandArg.defineCLIArgSpecs({
    flags: [
        {
            name: "cron-time",
            description: "The cron time string (e.g., '0 0 * * *' for daily at midnight).",
            type: "string",
            required: true,
            checkFN: (value: string) => {
                const cronRegex = /^(\*|([0-5]?\d)) (\*|([01]?\d|2[0-3])) (\*|([01]?\d|2[0-3])) (\*|([01]?\d|2[0-3])) (\*|([01]?\d|2[0-3]))$/;
                if (!cronRegex.test(value)) {
                    return "Invalid cron time format. Please provide a valid cron expression.";
                }
                return true;
            },
        },
        {
            name: "bin-path",
            description: "The path to the backup binary.",
            type: "string",
            required: false,
            default: "/usr/local/bin/lcmc-vault-backups",
            checkFN: (value: string) => {
                if (!Utils.isExecutable(value)) {
                    return `The specified binary path '${value}' is not executable or does not exist.`;
                }
                return true;
            }
        },
        {
            name: "custom-env-file",
            description: "Path to a custom environment file.",
            type: "string",
            required: false
        }
    ]
})

class CronSetupCMD extends CLIBaseCommand {

    constructor() {
        super({
            name: "setup",
            description: "Setup cron job for automatic backup creation.",
            args: CRON_SETUP_CMD_ARG_SPEC,
        });
    }

    override async run(args: CLICommandArgParser.ParsedArgs<typeof CRON_SETUP_CMD_ARG_SPEC>, ctx: CLICommandContext): Promise<boolean> {

        Logger.log("Setting up cron job...");

        const cronTime = args.flags["cron-time"];
        const binPath = args.flags["bin-path"];
        const customENVFile = args.flags["custom-env-file"];

        const create_result = await CronHelper.createCronJob(cronTime, binPath, customENVFile, true);

        if (create_result) {
            Logger.log("Cron job created successfully.");
            return true;
        } else {
            Logger.error("Failed to create cron job.");
            return false;
        }
    }

}

class CronDeleteCMD extends CLIBaseCommand {

    constructor() {
        super({
            name: "delete",
            description: "Delete cron job for automatic backup creation."
        });
    }

    override async run(): Promise<boolean> {
        Logger.log("Deleting cron job...");

        const result = await CronHelper.deleteCronJob();
        if (result) {
            Logger.log("Cron job deleted successfully.");
            return true;
        } else {
            Logger.error("Failed to delete cron job.");
            return false;
        }
    }

}
