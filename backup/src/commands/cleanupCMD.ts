import { CLIBaseCommand, CLICommandContext } from "@cleverjs/cli";
import { S3Service } from "../services/s3-service.js";
import { RetentionService } from "../services/retention-service.js";
import { Logger } from "../utils/logger.js";
import { ConfigHandler } from "../utils/configHandler.js";

export class CleanupBackupCMD extends CLIBaseCommand {

    constructor() {
        super({
            name: "cleanup",
            description: "Deletes historical backups according to the configured retention policy."
        });
    }

    override async run(_args: unknown, ctx: CLICommandContext): Promise<boolean> {
        const config = await ConfigHandler.forceReloadConfig(false);

        const retentionConfig = RetentionService.parseConfig({
            retentionDays: config.LCMC_VAULT_BACKUP_RETENTION_DAYS,
            minCount: config.LCMC_VAULT_BACKUP_RETENTION_MIN_COUNT
        });

        if (retentionConfig.retentionDays === undefined) {
            Logger.error("Retention cleanup is not configured. Set LCMC_VAULT_BACKUP_RETENTION_DAYS to enable cleanup.");
            return false;
        }

        const s3 = S3Service.fromConfig(config);
        const deleted = await RetentionService.applyRetention(s3, retentionConfig);

        if (deleted.length > 0) {
            Logger.log(`Cleanup finished. Deleted ${deleted.length} historical backup(s).`);
        } else {
            Logger.log("Cleanup finished. No historical backups needed deletion.");
        }

        return true;
    }

}
