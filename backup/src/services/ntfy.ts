import { Logger } from "../utils/logger";

export class NtfyService {

    constructor(
        protected readonly ntfyUrl: string,
        protected readonly authToken?: string
    ) {}

    protected async sendNotification(title: string, message: string, type: "success" | "warning" | "error"): Promise<void> {
        
        const response = await fetch(this.ntfyUrl, {
            method: "POST",
            headers: {
                "Title": title,
                "Priority": type === "success" ? "1" : "5",
                "Tags": `lcmc-vault-auto-backup,${type === "success" ? "white_check_mark" : type === "warning" ? "warning" : "x"}`,

                ...(this.authToken ? {
                    "Authorization": `Bearer ${this.authToken}`
                } : {})
            },
            body: message
        });
        if (!response.ok) {
            Logger.error(`Failed to send notification: ${response.statusText}`);
            return;
        }
        Logger.info("Notification sent successfully.");
    }

    async notifySuccess(message: string): Promise<void> {
        await this.sendNotification("LCMC Vault Backup Successful", message, "success");
    }

    async notifyWarning(message: string): Promise<void> {
        await this.sendNotification("LCMC Vault Backup Warning", message, "warning");
    }

    async notifyError(message: string, logLines: string[]): Promise<void> {
        await this.sendNotification("LCMC Vault Backup Failed", `${message}\n\nLogs:\n${logLines.join("\n")}`, "error");
    }

}