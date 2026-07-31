import fs from "fs/promises";
import path from "path";
import { afterAll, beforeAll } from "bun:test"
import { ConfigHandler } from "../../src/utils/configHandler";
import S3rver from "s3rver";

function setTestEnv(rootDir: string) {
    const envVars = {
        LCMC_VAULT_BACKUP_LOG_LEVEL: "debug",

        LCMC_VAULT_BACKUP_S3_REGION: "us-east-1",
        LCMC_VAULT_BACKUP_S3_ACCESS_KEY_ID: "S3RVER",
        LCMC_VAULT_BACKUP_S3_SECRET_ACCESS_KEY: "S3RVER",
        LCMC_VAULT_BACKUP_S3_BUCKET: "test-bucket",

        LCMC_VAULT_BACKUP_DATA_DIR: `${rootDir}/data`,

        LCMC_VAULT_BACKUP_DATABASE_METHOD: "auto",

        LCMC_VAULT_BACKUP_SAVE_ENV: "true",
        LCMC_VAULT_BACKUP_AUTO_BACKUP: "false",

        LCMC_VAULT_BACKUP_RETENTION_DAYS: "30",
        LCMC_VAULT_BACKUP_RETENTION_MIN_COUNT: "3",

        LCMC_VAULT_BACKUP_ENCRYPTION_PASSPHRASE: "test-passphrase",
    } as const;

    for (const [key, value] of Object.entries(envVars)) {
        process.env[key] = value;
    }

    // Remove optional variables that should be absent in this test run.
    delete process.env.LCMC_VAULT_BACKUP_S3_BASE_PATH;
    delete process.env.LCMC_VAULT_BACKUP_NTFY_URL;
    delete process.env.LCMC_VAULT_BACKUP_NTFY_AUTH_TOKEN;
}

async function createIsolatedDataDir(): Promise<string> {
    const root = await fs.mkdtemp(path.join(process.cwd(), "tmp-data-"));
    return root;
}

let TMP_ROOT: string | null = null;
let s3rverInstance: S3rver | null = null;

beforeAll(async () => {
    TMP_ROOT = await createIsolatedDataDir();

    setTestEnv(TMP_ROOT);

    // Start local S3 server on a random free port before wiring the endpoint
    // into the config, so tests never clash with an already-bound port.
    const s3rverDir = path.join(TMP_ROOT, "s3rver");
    await fs.mkdir(s3rverDir, { recursive: true });
    s3rverInstance = new S3rver({
        port: 0,
        address: "127.0.0.1",
        silent: true,
        directory: s3rverDir,
        allowMismatchedSignatures: true,
        configureBuckets: [{ name: process.env.LCMC_VAULT_BACKUP_S3_BUCKET! }],
    });

    const address = await s3rverInstance.run();
    process.env.LCMC_VAULT_BACKUP_S3_ENDPOINT = `http://${address.address}:${address.port}`;

    await ConfigHandler.forceReloadConfig(false);
});

afterAll(async () => {


    if (s3rverInstance) {
        await new Promise<void>((resolve) => {
            s3rverInstance!.close(() => resolve());
        });
    }

    if (TMP_ROOT) {
        await fs.rm(TMP_ROOT, { recursive: true, force: true });
    }
    

});
