import { CLICMD, type CLICMDAlias, type CLICMDExecMeta } from "@cleverjs/cli";
import { Compiler, type PlatformArg, Platforms } from "./compiler.js";

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

export class CompileAllCMD extends CLICMD {
    readonly name = "all";
    readonly description = "Compile for all platforms";
    readonly usage = "all";

    async run(args: string[]) {
        const builds: Promise<void>[] = [];

        const version_settings = await CompileUtils.getTargetVersion(args);

        for (const platform in Platforms) {
            builds.push(new Compiler(platform as PlatformArg, ...version_settings).build());
        }
        await Promise.all(builds);
    }
}

export class CompileToTargetCMD extends CLICMD {
    readonly name = "auto";
    readonly description = "Compile for a specified platform";
    readonly usage = "[<platform> | auto | all] [<version>] [--no-version-tag]";
    readonly aliases = Object.keys(Platforms);

    async run(args: string[], meta: CLICMDExecMeta) {
        const platform = (meta.parent_args.at(-1) || "auto") as PlatformArg;

        if (Object.keys(Platforms).some(p => p === platform) === false && platform !== "auto") {
            console.log(`Invalid platform: ${platform}`);
            return;
        }
        const version_settings = await CompileUtils.getTargetVersion(args);
        await new Compiler(platform, ...version_settings).build();
    }

}
