import { CLIBaseCommand } from "@cleverjs/cli";
import { Logger } from "../logger";

export class VersionCMD extends CLIBaseCommand {
    
    constructor() {
        super({
            name: "version",
            description: "Prints the version of the tool.",
            aliases: ["-v", "--version"]
        });
    }

    async run() {
        const version = process.env.APP_VERSION || "unknown";
        Logger.log(`${version}`);
        return true;
    }
}
