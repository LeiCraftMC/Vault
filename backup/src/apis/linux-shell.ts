
export class LinuxShellAPI {

    static async handleExec(sp: any) {
        try {
            const result = await sp.quiet();
            return result.text();
        } catch (e: any) {
            if (e.stderr) {
                throw new Error(`Failed to execute command \n${e.stderr}\n`);
            }
            throw new Error(`Failed to execute command`);
        }
    }

    static async exec(args: string[]) {
        const proc = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });
        const exitCode = await proc.exited;
        if (exitCode !== 0) {
            const stderr = await new Response(proc.stderr).text();
            throw new Error(`Command failed: ${args.join(" ")}\n${stderr}`);
        }
        return await new Response(proc.stdout).text();
    }

    static commandExists(cmd: string) {
        return this.exec(["which", cmd])
            .then(() => true)
            .catch(() => false);
    }

    static getFile(path: string) {
        const file = Bun.file(path);
        if (!file.exists()) {
            throw new Error(`File ${path} does not exist`);
        }
        return file.text();
    }

    static delFile(path: string) {
        const file = Bun.file(path);
        if (!file.exists()) {
            throw new Error(`File ${path} does not exist`);
        }
        return file.delete();
    }

    static getEnv() {
        let env = "";
        for (const key in process.env) {
            env += `${key}=${process.env[key]}\n`;
        }
        return env.trimEnd();
    }

}
