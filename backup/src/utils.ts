import { CMDFlag, CMDFlagsParser } from "@cleverjs/cli";
import { ConfigHandler } from "./configHandler.js";
import { Logger } from "./logger.js";

export class Utils {

    static async parseDefaultArgs(args: string[], parent_args: string[] = []) {

        const flagParser = new CMDFlagsParser({
            "--config": new CMDFlag("string", "Path to the configuration file", false, null),
            "--as-cron": new CMDFlag("bool", "Run as cron job", true, false),
        });

        const parsingResult = flagParser.parse(args, true);
        if (typeof parsingResult === "string") {
            Logger.error(parsingResult);
            process.exit(1);
        }
        const flags = parsingResult.result;
        args = parsingResult.discarded;

        return {
            args,
            config: await ConfigHandler.parseConfigFile(flags["--config"]),
            flags
        };
    }
    
}

