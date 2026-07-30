import { ConfigHandler } from "./configHandler.js";
import { Logger } from "./logger.js";
import { existsSync as fs_existsSync, statSync as fs_statSync } from "fs";

export class Utils {

    static isExecutable(path: string) {
        try {
            return fs_existsSync(path) && fs_statSync(path).mode & 0o111 ? true : false;
        } catch (err) {
            Logger.error(`Error checking if path '${path}' is executable: ${err}`);
            return false;
        }
            
    }

    static isDirWritable(path: string) {
        try {
            return fs_existsSync(path) && fs_statSync(path).isDirectory() && fs_statSync(path).mode & 0o200 ? true : false;
        } catch (err) {
            Logger.error(`Error checking if directory '${path}' is writable: ${err}`);
            return false;
        }
    }

    static existsSync(path: string) {
        try {
            return fs_existsSync(path);
        } catch (err) {
            Logger.error(`Error checking if path '${path}' exists: ${err}`);
            return false;
        }
    }
    
}

