import { randomBytes, createCipheriv, createDecipheriv, pbkdf2Sync } from "crypto";
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
}



