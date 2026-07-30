import { CLIBaseCommand, CLICommandArg, CLICommandArgParser, type CLICommandContext } from "@cleverjs/cli";
import { Compiler, type PlatformArg, Platforms } from "./compiler";

class CompileUtils {
    static async getPackageJSONVersion() {
        try {
            const packageJSON = await Bun.file(process.cwd() + "/package.json").json() as {version: string};
            return packageJSON.version;
        } catch (err: any) {
            console.log("Error reading package.json: " + err.stack);
            process.exit(1);
        }
    }
    static async getTargetVersion(args: Array<string | undefined>): Promise<[string, boolean]> {
        if (args[0] === "--no-version-tag") {
            const version = await this.getPackageJSONVersion()
            return [version, false];
        }
        const argv_version = args[0] || process.env.APP_TARGET_VERSION;
        const version = argv_version || await this.getPackageJSONVersion();

        if (!version) {
            console.log("No version specified. Please specify a version.");
            process.exit(1);
        }

        const versionInFileName = args[1] === "--no-version-tag" ? false : true;
        return [version, versionInFileName];
    }
}


const CMD_ARG_SPEC = CLICommandArg.defineCLIArgSpecs({
    args: [
        {
            name: "all",
            variadic: true,
            description: "Args",
            type: "string"
        }
    ]
});

export class CompileAllCMD extends CLIBaseCommand<typeof CMD_ARG_SPEC> {

    constructor() {
        super({
            name: "all",
            description: "Compile for all platforms",
            args: CMD_ARG_SPEC
        });
    }

    override async run(args: CLICommandArgParser.ParsedArgs<typeof CMD_ARG_SPEC>, ctx: CLICommandContext): Promise<boolean> {
        const builds: Promise<void>[] = [];

        const version_settings = await CompileUtils.getTargetVersion(args.args.all);

        for (const platform in Platforms) {
            builds.push(new Compiler(platform as PlatformArg, ...version_settings).build());
        }
        await Promise.all(builds);

        return true;
    }
}

export class CompileToTargetCMD extends CLIBaseCommand<typeof CMD_ARG_SPEC> {
    
    readonly usage = "[<platform> | auto | all] [<version>] [--no-version-tag]";

    constructor() {
        super({
            name: "auto",
            description: "Compile for a specified platform",
            aliases: Object.keys(Platforms),
            args: CMD_ARG_SPEC
        });
    }

    override async run(args: CLICommandArgParser.ParsedArgs<typeof CMD_ARG_SPEC>, ctx: CLICommandContext): Promise<boolean> {
        const platform = (ctx.raw_parent_args.at(-1) || "auto") as PlatformArg;

        if (Object.keys(Platforms).some(p => p === platform) === false && platform !== "auto") {
            console.log(`Invalid platform: ${platform}`);
            return false;
        }
        const version_settings = await CompileUtils.getTargetVersion(args.args.all);
        await new Compiler(platform, ...version_settings).build();

        return true;
    }

}