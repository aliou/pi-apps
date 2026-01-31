import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Encrypted data structure stored in database.
 */
export interface EncryptedData {
  /** Base64-encoded initialization vector (12 bytes for GCM) */
  iv: string;
  /** Base64-encoded ciphertext */
  ciphertext: string;
  /** Base64-encoded authentication tag (16 bytes) */
  tag: string;
  /** Key version for rotation support */
  keyVersion: number;
}

/**
 * AES-256-GCM encryption service for secrets at rest.
 *
 * Security properties:
 * - Authenticated encryption (confidentiality + integrity)
 * - Unique IV per encryption
 * - Key versioning for rotation support
 */
export class CryptoService {
  private readonly algorithm = "aes-256-gcm";
  private readonly ivLength = 12; // 96 bits for GCM
  private readonly keyVersion: number;
  private readonly key: Buffer;

  constructor(encryptionKey: string, keyVersion = 1) {
    // Key must be 32 bytes (256 bits) for AES-256
    const keyBuffer = Buffer.from(encryptionKey, "base64");
    if (keyBuffer.length !== 32) {
      throw new Error(
        `Encryption key must be 32 bytes (256 bits), got ${keyBuffer.length} bytes. ` +
          "Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
      );
    }
    this.key = keyBuffer;
    this.keyVersion = keyVersion;
  }

  /**
   * Encrypt plaintext using AES-256-GCM.
   */
  encrypt(plaintext: string): EncryptedData {
    const iv = randomBytes(this.ivLength);
    const cipher = createCipheriv(this.algorithm, this.key, iv);

    let ciphertext = cipher.update(plaintext, "utf8", "base64");
    ciphertext += cipher.final("base64");

    const tag = cipher.getAuthTag();

    return {
      iv: iv.toString("base64"),
      ciphertext,
      tag: tag.toString("base64"),
      keyVersion: this.keyVersion,
    };
  }

  /**
   * Decrypt ciphertext using AES-256-GCM.
   * Throws if authentication fails (tampered data).
   */
  decrypt(encrypted: EncryptedData): string {
    const iv = Buffer.from(encrypted.iv, "base64");
    const tag = Buffer.from(encrypted.tag, "base64");

    const decipher = createDecipheriv(this.algorithm, this.key, iv);
    decipher.setAuthTag(tag);

    let plaintext = decipher.update(encrypted.ciphertext, "base64", "utf8");
    plaintext += decipher.final("utf8");

    return plaintext;
  }

  /**
   * Get the current key version.
   */
  getKeyVersion(): number {
    return this.keyVersion;
  }

  /**
   * Generate a new encryption key (for initial setup or rotation).
   */
  static generateKey(): string {
    return randomBytes(32).toString("base64");
  }
}
