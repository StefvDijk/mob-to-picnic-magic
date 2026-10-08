import { describe, expect, it } from 'vitest';
import { decryptCredential, encryptCredential, type PicnicKeyEnv } from './credentials';

const raw = crypto.getRandomValues(new Uint8Array(32));
const encoded = btoa(String.fromCharCode(...raw));
const env: PicnicKeyEnv = { PICNIC_ENCRYPTION_KEY: encoded, PICNIC_ENCRYPTION_KEY_VERSION: 'v2' };

describe('Picnic credential encryption', () => {
  it('binds owner, connection, version, and purpose with AES-GCM AAD', async () => {
    const sealed = await encryptCredential(env, 'owner-a', 'connection-a', 'resume', 'private-resume-key');
    expect(sealed.ciphertext).not.toContain('private-resume-key');
    await expect(decryptCredential(env, 'owner-a', 'connection-a', 'resume', sealed.keyVersion, sealed.ciphertext)).resolves.toBe('private-resume-key');
    await expect(decryptCredential(env, 'owner-b', 'connection-a', 'resume', sealed.keyVersion, sealed.ciphertext)).rejects.toThrow();
    await expect(decryptCredential(env, 'owner-a', 'connection-b', 'resume', sealed.keyVersion, sealed.ciphertext)).rejects.toThrow();
    await expect(decryptCredential(env, 'owner-a', 'connection-a', 'pending-sms', sealed.keyVersion, sealed.ciphertext)).rejects.toThrow();
  });

  it('decrypts with a bounded previous key during rotation', async () => {
    const sealed = await encryptCredential(env, 'owner', 'connection', 'pending-sms', 'pending-key');
    const rotated: PicnicKeyEnv = {
      PICNIC_ENCRYPTION_KEY: btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))),
      PICNIC_ENCRYPTION_KEY_VERSION: 'v3', PICNIC_ENCRYPTION_PREVIOUS_KEYS: JSON.stringify({ v2: encoded }),
    };
    await expect(decryptCredential(rotated, 'owner', 'connection', 'pending-sms', sealed.keyVersion, sealed.ciphertext)).resolves.toBe('pending-key');
    await expect(decryptCredential({ ...rotated, PICNIC_ENCRYPTION_PREVIOUS_KEYS: 'x'.repeat(2048) }, 'owner', 'connection', 'pending-sms', sealed.keyVersion, sealed.ciphertext)).rejects.toThrow();
    await expect(decryptCredential(rotated, 'owner', 'connection', 'pending-sms', 'v2', 'x'.repeat(9000))).rejects.toThrow();
  });
});
