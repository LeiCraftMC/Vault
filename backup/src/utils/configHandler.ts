import { parse as dotenv_parse } from "dotenv";
import { Logger } from "./logger";

interface ConfigSchemaSetting<
    REQUIRED extends ConfigSchemaSetting.Required,
    TYPE extends ConfigSchemaSetting.Type = undefined,
    //DEPENDENCIES extends ConfigSchemaSetting.Dependencies = undefined
> {
    required: REQUIRED;
    type?: TYPE;
    //dependencies?: DEPENDENCIES;
}

namespace ConfigSchemaSetting {
    export type Required = boolean;
    export type Type = string[] | boolean[] | undefined;
    export type Dependencies = Record<string, string[]> | undefined;
    export type Sample = ConfigSchemaSetting<Required, Type/*, Dependencies*/>;
}

type ConfigValueType<
    T extends ConfigSchemaSetting.Sample,
    F = [T] extends [ConfigSchemaSetting<any, infer U/*, any*/>]
    ? U extends (string | boolean)[]
        ? U[number]
        : string
    : string
> = T["required"] extends true ? F : F | undefined;

interface ConfigSchemaSettings {
    [key: string]: ConfigSchemaSetting.Sample;
}

type ConfigLike<T extends ConfigSchemaSettings> = {
    [K in keyof T]: ConfigValueType<T[K]>;
}

class ConfigSchema<T extends ConfigSchemaSettings = {}> {

    readonly schema: T = {} as any;

    public add<
        KEY extends string,
        Setings extends ConfigSchemaSetting<ISREQUIRED, TYPE/*, DEPENDENCIES*/>,
        ISREQUIRED extends boolean,
        const TYPE extends ConfigSchemaSetting.Type = undefined,
        //const DEPENDENCIES extends ConfigSchemaSetting.Dependencies = undefined
    >(
        key: KEY,
        required = false as ISREQUIRED,
        type?: TYPE,
        //dependencies?: DEPENDENCIES
    ) {
        (this.schema as any)[key] = { required, type/*, dependencies*/ };
        return this as any as ConfigSchema<T & { [K in KEY]: Setings }>;
    }

    public parse(skipErrors: boolean = false) {
        const result: ConfigLike<T> = {} as ConfigLike<T>;

        for (const [key, settings] of Object.entries(this.schema)) {
            
            const value = process.env[key];

            if (!value) {
                if (settings.required && !skipErrors) {
                    Logger.error(`The environment variable ${key} is required but not set.`);
                    process.exit(1);
                }
                if (key === "LCMC_VAULT_BACKUP_DATA_DIR") {
                    (result[key] as any) = "/data";
                }
                if (key === "LCMC_VAULT_BACKUP_DATABASE_METHOD") {
                    (result[key] as any) = "auto";
                }
                continue;
            }

            if (settings.type) {
                if (typeof settings.type[0] === "boolean") {
                    (result[key] as any) = value.toLowerCase() === "true" ? true : false;
                    continue;
                }
                // Case-insensitive comparison for string enum values
                if (!(settings.type as string[]).some(t => t.toLowerCase() === value.toLowerCase()) && !skipErrors) {
                    Logger.error(`The environment variable ${key} has to be one of the following: ${settings.type.join(", ")}`);
                    process.exit(1);
                }
            }

            (result[key] as any) = value;

            /*if (settings.dependencies) {
                const dependencies = settings.dependencies[process.env[key]] || settings.dependencies["any"];
                if (!dependencies) continue;

                for (const dep of dependencies) {
                    if (!process.env[dep]) {
                        Logger.error(`The environment variable ${dep} is required by ${key} but not set.`);
                        process.exit(1);
                    }
                }
            }*/
        }
        return result;
    }

}

// @ts-ignore
export type ParsedConfig = ConfigLike<typeof ConfigHandler.schema.schema>;

export class ConfigHandler {

    private static schema = new ConfigSchema()
        .add("LCMC_VAULT_BACKUP_LOG_LEVEL", false, ["debug", "info", "warn", "error", "critical"])

        .add("LCMC_VAULT_BACKUP_S3_ENDPOINT", true)
        .add("LCMC_VAULT_BACKUP_S3_REGION", false)
        .add("LCMC_VAULT_BACKUP_S3_ACCESS_KEY_ID", true)
        .add("LCMC_VAULT_BACKUP_S3_SECRET_ACCESS_KEY", true)
        .add("LCMC_VAULT_BACKUP_S3_BUCKET", false)
        .add("LCMC_VAULT_BACKUP_S3_BASE_PATH", false)

        .add("LCMC_VAULT_BACKUP_NTFY_URL", false)
        .add("LCMC_VAULT_BACKUP_NTFY_AUTH_TOKEN", false)

        .add("LCMC_VAULT_BACKUP_DATA_DIR", false)

        .add("LCMC_VAULT_BACKUP_DATABASE_METHOD", false, ["auto", "vaultwarden", "sqlite3", "none"])

        .add("LCMC_VAULT_BACKUP_SAVE_ENV", false, [true, false])

        .add("LCMC_VAULT_BACKUP_AUTO_BACKUP", false, [true, false])

        .add("LCMC_VAULT_BACKUP_RETENTION_DAYS", false)
        .add("LCMC_VAULT_BACKUP_RETENTION_MIN_COUNT", false)

        .add("LCMC_VAULT_BACKUP_ENCRYPTION_PASSPHRASE", false);


    private static config: ParsedConfig | null = null;

    /** You have to call {@link ConfigHandler.parseConfigFile} before trying to access the config. */
    static getConfig() {
        return this.config;
    }

    private static async loadEnvWithoutOverwrite(file: string) {
        try {
            const content = await Bun.file(file).text();
            const env = dotenv_parse(content);
        
            for (const key in env) {
                if (!process.env[key]) {
                    process.env[key] = env[key];
                }
            }
        } catch (e: any) {
            Logger.error(`Error reading the env file: ${e.message}`);
            process.exit(1);
        }
    }

    static async loadConfig(file?: string, skipErrors: boolean = false) {
        if (this.config) return this.config;

        if (file) {
            await this.loadEnvWithoutOverwrite(file);
        }


        this.config = this.schema.parse(skipErrors);
        return this.config;
    }

    static async forceReloadConfig(skipErrors: boolean = false) {
        this.config = null;
        return await this.loadConfig(undefined, skipErrors);
    }

}
