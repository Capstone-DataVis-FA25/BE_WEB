import { Injectable } from '@nestjs/common';
import {
  KMSClient,
  GenerateDataKeyCommand,
  DecryptCommand,
} from '@aws-sdk/client-kms';
import * as crypto from 'crypto';

@Injectable()
export class KmsService {
  private kms: KMSClient;
  private keyId: string;

  constructor() {
    this.kms = new KMSClient({ region: process.env.AWS_REGION });
    this.keyId = process.env.AWS_KMS_KEY_ID!;
  }

  async encryptData(plaintext: string) {
    // 1. Ask KMS to generate a data key
    const { Plaintext, CiphertextBlob } = await this.kms.send(
      new GenerateDataKeyCommand({
        KeyId: this.keyId,
        KeySpec: 'AES_256',
      }),
    );

    if (!Plaintext || !CiphertextBlob) {
      throw new Error('Failed to generate data key');
    }

    // 2. Use the plaintext data key locally with AES-256-GCM
    const iv = crypto.randomBytes(16); // initialization vector
    const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(Plaintext), iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    const authTag = cipher.getAuthTag();

    return {
      encryptedData: encrypted,
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
      encryptedDataKey: Buffer.from(CiphertextBlob).toString('base64'),
    };
  }

  async decryptData(encryptedData: string, encryptedDataKey: string, iv: string, authTag: string) {
    // 1. Decrypt the data key using KMS
    const { Plaintext } = await this.kms.send(
      new DecryptCommand({
        CiphertextBlob: Buffer.from(encryptedDataKey, 'base64'),
      }),
    );

    if (!Plaintext) {
      throw new Error('Failed to decrypt data key');
    }

    // 2. Decrypt locally with AES-256-GCM
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      Buffer.from(Plaintext),
      Buffer.from(iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(authTag, 'base64'));

    let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }
};
