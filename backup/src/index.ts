import { Logger } from "./utils/logger";
import { CLIApp, CLICommandArg, CLICommandArgParser, CLICommandContext, type CLICMDExecEnv } from "@cleverjs/cli";
import { CreateBackupCMD } from "./commands/createCMD";
import { DownloadBackupCMD } from "./commands/downloadCMD";
import { CronCMD } from "./commands/cronCMDs";
import { VersionCMD } from "./commands/versionCMD";
import { ConfigHandler } from "./utils/configHandler";

new CLIApp({
    globalFlags: CLICommandArg.defineCLIFlagSpecs([
        {
            name: "config",
            type: "string",
            description: "Path to the env configuration file.",
            required: false,
        },
        {
            name: "log-level",
            type: "enum",
            allowedValues: ["debug" , "info" , "warn" , "error" , "critical"],
            description: "Set the log level for the application.",
            default: "info"
        }
    ]),
    logger: Logger,
    exitOnError: true
})
    .register(new CreateBackupCMD())
    .register(new DownloadBackupCMD())
    .register(new CronCMD())
    .register(new VersionCMD())

    .use(async (args, ctx, next) => {

        const config = await ConfigHandler.loadConfig(args["config"])!;

        Logger.setLogLevel(config.LCMC_VAULT_BACKUP_LOG_LEVEL || args["log-level"]);

        return await next();
    })

    .handle(process.argv.slice(2), "shell");
