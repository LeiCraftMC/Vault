import { randomBytes, createCipheriv, createDecipheriv, pbkdf2Sync } from "crypto";
import { createReadStream, createWriteStream } from "fs";
import { open, stat } from "fs/promises";
import { Transform } from "stream";
import { pipeline } from "stream/promises";
import { Uint } from "low-level";

export class AES256 {

    private static readonly ALGORITHM = "aes-256-gcm";
    private static readonly SALT_LENGTH = 16;
    private static readonly IV_LENGTH = 12;
    private static readonly KEY_LENGTH = 32;
    private static readonly ITERATIONS = 100000;
    private static readonly DIGEST = "sha256";

    /**
     * Encrypts a plaintext using the given passphrase.
     * @param plaintext The plaintext to encrypt.
     * @param passphrase The passphrase to use.
     * @returns The encrypted ciphertext.
     */
    static encrypt(plaintext: Uint, passphrase: string) {
        const salt = randomBytes(AES256.SALT_LENGTH);
        const iv = randomBytes(AES256.IV_LENGTH);
        const key = pbkdf2Sync(passphrase, salt, AES256.ITERATIONS, AES256.KEY_LENGTH, AES256.DIGEST);

        const cipher = createCipheriv(AES256.ALGORITHM, key, iv);
        const encrypted = Buffer.concat([cipher.update(plaintext.getRaw()), cipher.final()]);
        const authTag = cipher.getAuthTag();

        return Uint.concat([salt, iv, authTag, encrypted]);
    }

    /**
     * Decrypts a ciphertext using the given passphrase.
     * @param ciphertext The ciphertext to decrypt.
     * @param passphrase The passphrase to use.
     * @returns The decrypted plaintext or null if the decryption failed.
     */
    static decrypt(ciphertext: Uint, passphrase: string) {
        try {
            const data = ciphertext.getRaw();
            const salt = data.subarray(0, AES256.SALT_LENGTH);
            const iv = data.subarray(AES256.SALT_LENGTH, AES256.SALT_LENGTH + AES256.IV_LENGTH);
            const authTag = data.subarray(AES256.SALT_LENGTH + AES256.IV_LENGTH, AES256.SALT_LENGTH + AES256.IV_LENGTH + 16);
            const encrypted = data.subarray(AES256.SALT_LENGTH + AES256.IV_LENGTH + 16);

            const key = pbkdf2Sync(passphrase, salt, AES256.ITERATIONS, AES256.KEY_LENGTH, AES256.DIGEST);

            const decipher = createDecipheriv(AES256.ALGORITHM, key, iv);
            decipher.setAuthTag(authTag);

            return Uint.concat([decipher.update(encrypted), decipher.final()]);
        } catch (error) {
            return null;
        }
    }

    /**
     * Streams a file through AES-256-GCM and writes the result to another file.
     * Produces the same byte layout as {@link AES256.encrypt}: salt + iv + authTag + encrypted.
     *
     * @param inputPath Path to the plaintext file.
     * @param outputPath Path to write the encrypted file.
     * @param passphrase The passphrase to use.
     */
    static async encryptFile(inputPath: string, outputPath: string, passphrase: string) {
        const salt = randomBytes(AES256.SALT_LENGTH);
        const iv = randomBytes(AES256.IV_LENGTH);
        const key = pbkdf2Sync(passphrase, salt, AES256.ITERATIONS, AES256.KEY_LENGTH, AES256.DIGEST);
        const cipher = createCipheriv(AES256.ALGORITHM, key, iv);

        const input = createReadStream(inputPath);
        const output = createWriteStream(outputPath);

        // Reserve space for the auth tag; it will be overwritten once the cipher finishes.
        output.write(Buffer.concat([salt, iv, Buffer.alloc(16)]));

        const transform = new Transform({
            transform(chunk: Buffer, _encoding, callback) {
                try {
                    this.push(cipher.update(chunk));
                    callback();
                } catch (err) {
                    callback(err as Error);
                }
            },
            flush(callback) {
                try {
                    this.push(cipher.final());
                    callback();
                } catch (err) {
                    callback(err as Error);
                }
            }
        });

        await pipeline(input, transform, output);

        const authTag = cipher.getAuthTag();
        const fd = await open(outputPath, "r+");
        try {
            await fd.write(authTag, 0, 16, AES256.SALT_LENGTH + AES256.IV_LENGTH);
        } finally {
            await fd.close();
        }
    }

    /**
     * Streams an encrypted file (salt + iv + authTag + encrypted) through AES-256-GCM
     * and writes the plaintext to another file.
     *
     * @param inputPath Path to the encrypted file.
     * @param outputPath Path to write the decrypted file.
     * @param passphrase The passphrase to use.
     * @returns `true` on success, `false` if decryption failed (wrong passphrase, corrupt data, etc.).
     */
    static async decryptFile(inputPath: string, outputPath: string, passphrase: string): Promise<boolean> {
        try {
            const fileStat = await stat(inputPath);
            const fileSize = fileStat.size;
            const headerLength = AES256.SALT_LENGTH + AES256.IV_LENGTH + 16;

            if (fileSize <= headerLength) {
                return false;
            }

            const fd = await open(inputPath, "r");
            const salt = Buffer.alloc(AES256.SALT_LENGTH);
            const iv = Buffer.alloc(AES256.IV_LENGTH);
            const authTag = Buffer.alloc(16);

            await fd.read(salt, 0, AES256.SALT_LENGTH, 0);
            await fd.read(iv, 0, AES256.IV_LENGTH, AES256.SALT_LENGTH);
            await fd.read(authTag, 0, 16, AES256.SALT_LENGTH + AES256.IV_LENGTH);
            await fd.close();

            const key = pbkdf2Sync(passphrase, salt, AES256.ITERATIONS, AES256.KEY_LENGTH, AES256.DIGEST);
            const decipher = createDecipheriv(AES256.ALGORITHM, key, iv);
            decipher.setAuthTag(authTag);

            const ciphertextStart = headerLength;
            const ciphertextEnd = fileSize - 1;
            const input = createReadStream(inputPath, { start: ciphertextStart, end: ciphertextEnd });
            const output = createWriteStream(outputPath);

            const transform = new Transform({
                transform(chunk: Buffer, _encoding, callback) {
                    try {
                        this.push(decipher.update(chunk));
                        callback();
                    } catch (err) {
                        callback(err as Error);
                    }
                },
                flush(callback) {
                    try {
                        this.push(decipher.final());
                        callback();
                    } catch (err) {
                        callback(err as Error);
                    }
                }
            });

            await pipeline(input, transform, output);
            return true;
        } catch (err) {
            return false;
        }
    }
}



