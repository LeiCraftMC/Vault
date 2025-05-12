import { CLICMD } from "@cleverjs/cli";
import { Logger } from "../logger";

export class VersionCMD extends CLICMD {
    readonly name = "version";
    readonly description = "Prints the version of the tool.";
    readonly usage = "version";
    readonly aliases = ["-v", "--version"];

    async run(args: string[]) {
        const version = process.env.APP_VERSION || "unknown";
        Logger.log(`${version}`);
    }
}
