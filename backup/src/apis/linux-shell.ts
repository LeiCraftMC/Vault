import { type ShellPromise } from "bun";
import { existsSync } from "fs";

export class LinuxShellAPI {

    static async handleExec(sp: ShellPromise) {
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