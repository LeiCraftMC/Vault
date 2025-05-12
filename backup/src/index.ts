import { Logger } from "./logger";
import { CLIApp, CMDFlag, CMDFlagsParser, type CLICMDExecMeta } from "@cleverjs/cli";
import { CreateBackupCMD } from "./commands/createCMD";
import { DownloadBackupCMD } from "./commands/downloadCMD";
import { CronCMD } from "./commands/cronCMDs";
import { VersionCMD } from "./commands/versionCMD";

class Main extends CLIApp {
    
    protected flagParser = new CMDFlagsParser({
        "--log-level": new CMDFlag("string", "Log level", false, null),
    });

    protected onInit(): void | Promise<void> {
        this.register(new CreateBackupCMD());
        this.register(new DownloadBackupCMD());
        this.register(new CronCMD());
        this.register(new VersionCMD());
    }

    protected async run_help(meta: CLICMDExecMeta): Promise<void> {
        Logger.log(`Vault Backups CLI v${process.env.APP_VERSION || "unknown"}`);
        Logger.log("Usage: vault-backups <command> [...args]");
        Logger.log("Options:");
        Logger.log("  --config=<path_to_env>  Path to the env file, if there are not automatically set");
        super.run_help(meta);
    }

    async run(args: string[], meta: CLICMDExecMeta): Promise<void> {
        
        const parsingResult = this.flagParser.parse(args, true);

        if (typeof parsingResult === "string") {
            Logger.error(parsingResult);
            process.exit(1);
        }
        const flags = parsingResult.result;
        args = parsingResult.discarded;

        if (flags["--log-level"]) {
            Logger.setLogLevel(flags["--log-level"] as any);
        }

        return super.run(args, meta);
    }

}


new Main(
    "shell",
    Logger.log.bind(Logger),
).handle(process.argv.slice(2));
