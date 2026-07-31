
export class Logger {

    private static readonly logLevelMap = {
        debug: 0,
        info: 1,
        warn: 2,
        error: 3,
        critical: 4,
    } as const;

    private static logLevel: typeof this.logLevelMap[Logger.LogLevel] = this.logLevelMap.info;
    
    private static readonly logHistory: string[] = [];

    static setLogLevel(level: Logger.LogLevel) {
        if (this.logLevelMap[level] === undefined) {
            throw new Error(`Invalid log level: ${level}`);
        }
        this.logLevel = this.logLevelMap[level];
    }

    static getLogLevel(): Logger.LogLevel {
        const match = Object.entries(this.logLevelMap).find(([_, value]) => value === this.logLevel);
        return (match ? match[0] : "info") as Logger.LogLevel;
    }

    static getLogHistory(): string[] {
        return this.logHistory;
    }


    static debug(...args: any[]) {

        if (this.logLevel <= this.logLevelMap.debug) {

            const date = new Date(Date.now()).toISOString();
            
            console.debug(`[${date}]`, "[DEBUG]", ...args);
            this.logHistory.push(`[${date}] [DEBUG] ${args.join(" ")}`);

        }
    }

    static log(...args: any[]) {

        if (this.logLevel <= this.logLevelMap.info) {

            const date = new Date(Date.now()).toISOString();

            console.log(`[${date}]`, "[INFO]", ...args);
            this.logHistory.push(`[${date}] [INFO] ${args.join(" ")}`);
        }
    }

    static info(...args: any[]) {

        if (this.logLevel <= this.logLevelMap.info) {

            const date = new Date(Date.now()).toISOString();

            console.info(`[${date}]`, "[INFO]", ...args);
            this.logHistory.push(`[${date}] [INFO] ${args.join(" ")}`);
        }
    }

    static warn(...args: any[]) {

        if (this.logLevel <= this.logLevelMap.warn) {

            const date = new Date(Date.now()).toISOString();

            console.warn(`[${date}]`, "[WARN]", ...args);
            this.logHistory.push(`[${date}] [WARN] ${args.join(" ")}`);
        }
    }

    static error(...args: any[]) {

        if (this.logLevel <= this.logLevelMap.error) {

            const date = new Date(Date.now()).toISOString();

            console.error(`[${date}]`, "[ERROR]", ...args);
            this.logHistory.push(`[${date}] [ERROR] ${args.join(" ")}`);
        }
    }

    static critical(...args: any[]) {
        
        if (this.logLevel <= this.logLevelMap.critical) {

            const date = new Date(Date.now()).toISOString();

            console.error(`[${date}]`, "[CRITICAL]", ...args);
            this.logHistory.push(`[${date}] [CRITICAL] ${args.join(" ")}`);
        }
    }

}

export namespace Logger {
    export type LogLevel = "debug" | "info" | "warn" | "error" | "critical";
}