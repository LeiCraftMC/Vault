import dotenv from "dotenv";
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

    public parse() {
        const result: ConfigLike<T> = {} as ConfigLike<T>;

        for (const [key, settings] of Object.entries(this.schema)) {
            
            const value = process.env[key];

            if (!value) {
                if (settings.required) {
                    Logger.error(`The environment variable ${key} is required but not set.`);
                    process.exit(1);
                }
                continue;
            }

            if (settings.type) {
                if (typeof settings.type[0] === "boolean") {
                    (result[key] as any) = value.toLowerCase() === "true" ? true : false;
                    continue;
                }
                if (!(settings.type as string[]).includes(value.toLowerCase())) {
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
        .add("VB_S3_ENDPOINT", true)
        .add("VB_S3_ACCESS_KEY_ID", true)
        .add("VB_S3_SECRET_ACCESS_KEY", true)
        .add("VB_S3_BUCKET", false)
        .add("VB_S3_BASE_PATH", false)

        .add("PB_WEB_SERVER_USER", true)
        .add("PB_CAKE_BIN", true)
        .add("PB_GPG_SERVER_PRIVATE_KEY", true)
        .add("PB_GPG_SERVER_PUBLIC_KEY", true)
        .add("PB_PASSBOLT_CONFIG_FILE", false)

        .add("PB_SAVE_ENV", false, [true, false])

        .add("VB_AUTO_BACKUP", false, [true, false])

        .add("VB_ENCRYPTION_PASSPHRASE", false);


    private static config: ParsedConfig | null = null;

    /** You have to call {@link ConfigHandler.parseConfigFile} before trying to access the config. */
    static getConfig() {
        return this.config;
    }

    private static async loadEnvWithoutOverwrite(file: string) {
        try {
            const content = await Bun.file(file).text();
            const env = dotenv.parse(content);
        
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

    static async parseConfigFile(file?: string | null): Promise<ParsedConfig> {
        if (this.config) return this.config;

        if (file) {
            await this.loadEnvWithoutOverwrite(file);
        }

        return this.schema.parse();
    }

}
