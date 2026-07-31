import { BE, Container, DataEncoder } from "flexbuf";
import { createReadStream, createWriteStream } from "fs";
import { open, stat } from "fs/promises";
import { pipeline } from "stream/promises";
import { Uint, Uint16, Uint64 } from "low-level";
import { AES256 } from "./crypto";

export type FilePath = string;

/**
 * Encodes a length using flexbuf's "unlimited" prefix scheme (base-15 digits terminated by 0xF).
 */
function encodeUnlimitedPrefix(length: number): Uint {
    const lenStr = length.toString(15) + "F";
    return Uint.from((lenStr.length % 2 === 0) ? lenStr : ("0" + lenStr));
}

/**
 * Decodes a flexbuf "unlimited" length prefix from the start of `data`.
 * Returns the decoded length and the number of bytes consumed by the prefix.
 */
function decodeUnlimitedPrefix(data: Uint): { length: number; prefixLength: number } | null {
    const hex = data.toHex().toUpperCase();
    const terminatorIndex = hex.indexOf("F");
    if (terminatorIndex === -1) {
        return null;
    }
    const base15Length = hex.slice(0, terminatorIndex);
    const length = parseInt(base15Length, 15);
    if (isNaN(length)) {
        return null;
    }
    const prefixLength = Math.ceil((base15Length.length + 1) / 2);
    return { length, prefixLength };
}

export interface RawArchiveFileInfo {
    header: BackupArchiveHeader;
    encrypted: boolean;
    contentOffset: number;
    contentLength: number;
}

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

    private tarballPath?: string;

    constructor(
        time: Uint64,
        content?: Uint,
        version: Uint16 = Uint16.from(1),
        tarballPath?: string
    ) {
        super(time, version);
        if (content !== undefined) {
            this.content = content;
        }
        if (tarballPath !== undefined) {
            this.tarballPath = tarballPath;
        }
    }

    readonly content?: Uint;


    public getTarball(): Uint {
        if (this.content !== undefined) {
            return this.content;
        }
        throw new Error("Tarball is stored on disk; use getTarballPath() for streaming access");
    }

    public getTarballPath(): string | undefined {
        return this.tarballPath;
    }


    public toHeader() {
        return new BackupArchiveHeader(
            this.time,
            this.version
        );
    }

    public toRaw() {
        if (this.content === undefined) {
            throw new Error("Cannot convert a file-backed archive to an in-memory RawBackupArchive");
        }
        return new RawBackupArchive(this.toHeader(), false, this.content);
    }


    /**
     * Encrypts a backup archive
     * @param passphrase The passphrase to encrypt the backup archive
     */
    public encrypt(passphrase: string) {
        if (this.content === undefined) {
            throw new Error("Cannot encrypt a file-backed archive in memory");
        }
        const encryptedContent = AES256.encrypt(this.content, passphrase);
        return new RawBackupArchive(this.toHeader(), true, encryptedContent);
    }


    static fromTarball(time: Uint64, tarball: Uint) {
        return new BackupArchive(time, tarball);
    }

    static fromTarballFile(time: Uint64, tarballPath: string) {
        return new BackupArchive(time, undefined, Uint16.from(1), tarballPath);
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

    /**
     * Streams a raw backup archive to a file, reading the content from `contentPath`.
     * Produces the same byte layout as {@link RawBackupArchive.encodeToHex}.
     */
    static async encodeToFile(
        outputPath: string,
        header: BackupArchiveHeader,
        encrypted: boolean,
        contentPath: string
    ) {
        const contentStat = await stat(contentPath);
        const contentLength = contentStat.size;

        const output = createWriteStream(outputPath);
        output.write(header.encodeToHex().getRaw());
        output.write(Buffer.from([encrypted ? 1 : 0]));
        output.write(encodeUnlimitedPrefix(contentLength).getRaw());

        const input = createReadStream(contentPath);
        await pipeline(input, output);
    }

    /**
     * Reads a raw backup archive file and decodes the header, encrypted flag,
     * and content metadata. The actual content bytes are not loaded into memory.
     */
    static async decodeFromFile(path: string): Promise<RawArchiveFileInfo> {
        const fd = await open(path, "r");
        try {
            const fileStat = await fd.stat();
            const fileSize = fileStat.size;

            const probeSize = 128;
            const probeBuffer = Buffer.alloc(probeSize);
            const readResult = await fd.read(probeBuffer, 0, probeSize, 0);
            const availableBytes = readResult.bytesRead;
            const probeData = Uint.from(Buffer.from(probeBuffer.subarray(0, availableBytes)));

            const headerResult = BackupArchiveHeader.fromDecodedHex(probeData, true);
            if (!headerResult) {
                throw new Error("Failed to decode backup archive header");
            }

            const { data: header, length: headerLength } = headerResult;
            if (availableBytes <= headerLength) {
                throw new Error("Backup archive file is too short");
            }

            const encrypted = probeData.getRaw()[headerLength] === 1;
            const prefixStart = headerLength + 1;
            const prefixData = probeData.subarray(prefixStart);
            const prefixResult = decodeUnlimitedPrefix(prefixData);
            if (!prefixResult) {
                throw new Error("Failed to decode content length prefix");
            }

            const contentOffset = prefixStart + prefixResult.prefixLength;
            const contentLength = prefixResult.length;

            if (fileSize < contentOffset + contentLength) {
                throw new Error("Backup archive file is truncated");
            }

            return { header, encrypted, contentOffset, contentLength };
        } finally {
            await fd.close();
        }
    }
}
