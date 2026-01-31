import { describe, expect, it } from "vitest";
import { CryptoService } from "./crypto.service";

describe("CryptoService", () => {
  const testKey = CryptoService.generateKey();

  describe("generateKey", () => {
    it("generates a 32-byte base64-encoded key", () => {
      const key = CryptoService.generateKey();
      const decoded = Buffer.from(key, "base64");
      expect(decoded.length).toBe(32);
    });

    it("generates unique keys each time", () => {
      const key1 = CryptoService.generateKey();
      const key2 = CryptoService.generateKey();
      expect(key1).not.toBe(key2);
    });
  });

  describe("constructor", () => {
    it("accepts a valid 32-byte key", () => {
      expect(() => new CryptoService(testKey)).not.toThrow();
    });

    it("rejects keys that are not 32 bytes", () => {
      const shortKey = Buffer.alloc(16).toString("base64");
      expect(() => new CryptoService(shortKey)).toThrow(/32 bytes/);
    });

    it("accepts custom key version", () => {
      const crypto = new CryptoService(testKey, 5);
      expect(crypto.getKeyVersion()).toBe(5);
    });
  });

  describe("encrypt/decrypt", () => {
    it("round-trips plaintext correctly", () => {
      const crypto = new CryptoService(testKey);
      const plaintext = "sk-ant-api03-secret-key-12345";

      const encrypted = crypto.encrypt(plaintext);
      const decrypted = crypto.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it("encrypts to different ciphertext each time (unique IV)", () => {
      const crypto = new CryptoService(testKey);
      const plaintext = "my-secret";

      const encrypted1 = crypto.encrypt(plaintext);
      const encrypted2 = crypto.encrypt(plaintext);

      expect(encrypted1.ciphertext).not.toBe(encrypted2.ciphertext);
      expect(encrypted1.iv).not.toBe(encrypted2.iv);
    });

    it("includes key version in encrypted data", () => {
      const crypto = new CryptoService(testKey, 3);
      const encrypted = crypto.encrypt("secret");

      expect(encrypted.keyVersion).toBe(3);
    });

    it("handles empty string", () => {
      const crypto = new CryptoService(testKey);
      const encrypted = crypto.encrypt("");
      const decrypted = crypto.decrypt(encrypted);

      expect(decrypted).toBe("");
    });

    it("handles unicode characters", () => {
      const crypto = new CryptoService(testKey);
      const plaintext = "API密钥🔑émojis";

      const encrypted = crypto.encrypt(plaintext);
      const decrypted = crypto.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it("handles long values", () => {
      const crypto = new CryptoService(testKey);
      const plaintext = "x".repeat(10000);

      const encrypted = crypto.encrypt(plaintext);
      const decrypted = crypto.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });
  });

  describe("authentication", () => {
    it("detects tampered ciphertext", () => {
      const crypto = new CryptoService(testKey);
      const encrypted = crypto.encrypt("secret");

      // Tamper with ciphertext
      const tampered = {
        ...encrypted,
        ciphertext: Buffer.from("tampered").toString("base64"),
      };

      expect(() => crypto.decrypt(tampered)).toThrow();
    });

    it("detects tampered IV", () => {
      const crypto = new CryptoService(testKey);
      const encrypted = crypto.encrypt("secret");

      // Tamper with IV
      const tampered = {
        ...encrypted,
        iv: Buffer.alloc(12).toString("base64"),
      };

      expect(() => crypto.decrypt(tampered)).toThrow();
    });

    it("detects tampered auth tag", () => {
      const crypto = new CryptoService(testKey);
      const encrypted = crypto.encrypt("secret");

      // Tamper with tag
      const tampered = {
        ...encrypted,
        tag: Buffer.alloc(16).toString("base64"),
      };

      expect(() => crypto.decrypt(tampered)).toThrow();
    });
  });

  describe("cross-instance decryption", () => {
    it("can decrypt with same key in different instance", () => {
      const crypto1 = new CryptoService(testKey);
      const crypto2 = new CryptoService(testKey);

      const encrypted = crypto1.encrypt("cross-instance-secret");
      const decrypted = crypto2.decrypt(encrypted);

      expect(decrypted).toBe("cross-instance-secret");
    });

    it("cannot decrypt with different key", () => {
      const key1 = CryptoService.generateKey();
      const key2 = CryptoService.generateKey();

      const crypto1 = new CryptoService(key1);
      const crypto2 = new CryptoService(key2);

      const encrypted = crypto1.encrypt("secret");

      expect(() => crypto2.decrypt(encrypted)).toThrow();
    });
  });
});
