import { CLIApp, type CLICMD, type CLICMDExecMeta } from "@cleverjs/cli";
import { CompileAllCMD, CompileToTargetCMD } from "./compileCMD.js";
import { Platforms } from "./compiler.js";

class CompileCMD extends CLIApp {

    protected onInit() {
        this.register(new CompileAllCMD());
        this.register(new CompileToTargetCMD());
    }

    protected async run_help(meta: CLICMDExecMeta): Promise<void> {
        console.log("Usage: bun compile [<platform> | auto | all] [<version>] [--no-version-tag]");
        console.log("Platforms: " + Object.keys(Platforms).join(", "));
    }

    async run(args: string[], meta: CLICMDExecMeta) {
        const cmd_name = args[0] as string | undefined;

        if (!cmd_name) {
            return (this.registry["auto"] as CLICMD).run(args, meta);
        }

        meta.parent_args.push("bun", "compile");

        return super.run(args, meta);
    }

};


await new CompileCMD("shell").handle(process.argv.slice(2));
