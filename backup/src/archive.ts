import { BE, Container, DataEncoder } from "flexbuf";
import { Uint, Uint16, Uint64 } from "low-level";
import { AES256 } from "./crypto";

export type FilePath = string;

export class BackupArchiveHeader extends Container {

    constructor(
        readonly time: Uint64,
        readonly version: Uint16 = Uint16.from(1)
    ) {super()}


    public getDateString() {
        return `${Temporal.Instant.fromEpochMilliseconds(Number(this.time.toBigInt()))
            .toZonedDateTimeISO(Temporal.Now.timeZoneId())
            .toString({ timeZoneName: 'never', calendarName: 'never' })
            .replace('T', '_')
            .replace(/:/g, '-')
            .slice(0, 19)}`;
    }

    public getArchiveName() {
        return `lcmc-vault-${this.getDateString()}.backup.tar.gz`;
    }


    protected static fromDict(obj: Dict<any>) {
        return new BackupArchiveHeader(obj.time, obj.version);
    }

    protected static readonly encodingSettings: readonly DataEncoder[] = [
        BE(Uint16, "version"),
        BE(Uint64, "time")
    ]

}

export class BackupArchive extends BackupArchiveHeader {

    constructor(
        time: Uint64,
        readonly content: Uint,
        version: Uint16 = Uint16.from(1)
    ) {super(time, version)}


    public getTarball() {
        return this.content;
    }


    public toHeader() {
        return new BackupArchiveHeader(
            this.time,
            this.version
        );
    }

    public toRaw() {
        return new RawBackupArchive(this.toHeader(), false, this.content);
    }


    /**
     * Encrypts a backup archive
     * @param passphrase The passphrase to encrypt the backup archive
     */
    public encrypt(passphrase: string) {
        const encryptedContent = AES256.encrypt(this.content, passphrase);
        return new RawBackupArchive(this.toHeader(), true, encryptedContent);
    }


    static fromTarball(time: Uint64, tarball: Uint) {
        return new BackupArchive(time, tarball);
    }

    /**
     * Decrypts a backup archive
     * @param data The encrypted data
     * @param passphrase The passphrase to decrypt the data. If data is not encrypted, this parameter is ignored.
     */
    static fromEncrypted(data: Uint, passphrase?: string) {
        const raw = RawBackupArchive.fromDecodedHex(data);
        if (!raw) return null;
        return BackupArchive.fromRaw(raw, passphrase);
    }

    /**
     * Decrypts a raw backup archive
     * @param raw The raw backup archive
     * @param passphrase The passphrase to decrypt the data. If data is not encrypted, this parameter is ignored.
     */
    static fromRaw(raw: RawBackupArchive, passphrase?: string) {
        let decryptedRawContent: Uint;

        if (raw.encrypted) {
            if (!passphrase) return null;

            decryptedRawContent = AES256.decrypt(raw.content, passphrase) as Uint;
            if (!decryptedRawContent) return null;
        } else {
            decryptedRawContent = raw.content;
        }

        return BackupArchive.fromHeaderAndContent(raw.header, decryptedRawContent);
    }

    static fromHeaderAndContent(header: BackupArchiveHeader, content: Uint) {
        return new BackupArchive(header.time, content, header.version);
    }


    protected static fromDict(obj: Dict<any>) {
        return new BackupArchive(obj.time, obj.content, obj.version);
    }

    protected static readonly encodingSettings: readonly DataEncoder[] = [
        ...BackupArchiveHeader.encodingSettings,
        BE.Custom("content", {type: "prefix", val: "unlimited"})
    ]

}


export class RawBackupArchive extends Container {
    constructor(
        readonly header: BackupArchiveHeader,
        readonly encrypted: boolean,
        readonly content: Uint
    ) {super()}

    protected static fromDict(obj: Dict<any>) {
        return new RawBackupArchive(obj.header, obj.encrypted, obj.content);
    }

    protected static encodingSettings: readonly DataEncoder[] = [
        BE.Object("header", BackupArchiveHeader),
        BE.Bool("encrypted"),
        BE.Custom("content", {type: "prefix", val: "unlimited"})
    ]
}
