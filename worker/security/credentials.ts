export interface PicnicKeyEnv {
  PICNIC_ENCRYPTION_KEY?: string;
  PICNIC_ENCRYPTION_KEY_VERSION?: string;
  PICNIC_ENCRYPTION_PREVIOUS_KEYS?: string;
}

export type CredentialPurpose = 'resume' | 'pending-sms';
export interface EncryptedCredential { ciphertext: string; keyVersion: string }

function decodeBase64(input: string): Uint8Array {
  if (input.length > 8192) throw new Error('Invalid encrypted credential');
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input)) {
    throw new Error('Invalid encryption key configuration');
  }
  const decoded = atob(input);
  return Uint8Array.from(decoded, char => char.charCodeAt(0));
}

function keyMap(env: PicnicKeyEnv): Map<string, Uint8Array> {
  const version = env.PICNIC_ENCRYPTION_KEY_VERSION;
  if (!version || !/^[A-Za-z0-9._-]{1,32}$/.test(version) || !env.PICNIC_ENCRYPTION_KEY) {
    throw new Error('Picnic encryption is not configured');
  }
  const current = decodeBase64(env.PICNIC_ENCRYPTION_KEY);
  if (current.byteLength !== 32) throw new Error('Invalid encryption key configuration');
  const keys = new Map<string, Uint8Array>([[version, current]]);
  if (env.PICNIC_ENCRYPTION_PREVIOUS_KEYS) {
    if (env.PICNIC_ENCRYPTION_PREVIOUS_KEYS.length > 1024) throw new Error('Invalid previous key configuration');
    let previous: unknown;
    try { previous = JSON.parse(env.PICNIC_ENCRYPTION_PREVIOUS_KEYS); }
    catch { throw new Error('Invalid previous key configuration'); }
    if (!previous || typeof previous !== 'object' || Array.isArray(previous) || Object.keys(previous).length > 8) {
      throw new Error('Invalid previous key configuration');
    }
    for (const [oldVersion, encoded] of Object.entries(previous)) {
      if (!/^[A-Za-z0-9._-]{1,32}$/.test(oldVersion) || typeof encoded !== 'string' || keys.has(oldVersion)) {
        throw new Error('Invalid previous key configuration');
      }
      const bytes = decodeBase64(encoded);
      if (bytes.byteLength !== 32) throw new Error('Invalid previous key configuration');
      keys.set(oldVersion, bytes);
    }
  }
  return keys;
}

function aad(ownerId: string, connectionId: string, version: string, purpose: CredentialPurpose): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(['picnic-credential', ownerId, connectionId, version, purpose]));
}

async function importAesKey(raw: Uint8Array, usage: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, usage);
}

export async function encryptCredential(env: PicnicKeyEnv, ownerId: string, connectionId: string,
  purpose: CredentialPurpose, plaintext: string): Promise<EncryptedCredential> {
  if (!plaintext || plaintext.length > 4096) throw new Error('Invalid credential');
  const version = env.PICNIC_ENCRYPTION_KEY_VERSION;
  if (!version) throw new Error('Picnic encryption is not configured');
  const raw = keyMap(env).get(version)!;
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce,
    additionalData: aad(ownerId, connectionId, version, purpose), tagLength: 128 },
  await importAesKey(raw, ['encrypt']), new TextEncoder().encode(plaintext));
  const bytes = new Uint8Array(12 + encrypted.byteLength);
  bytes.set(nonce);
  bytes.set(new Uint8Array(encrypted), 12);
  return { ciphertext: btoa(String.fromCharCode(...bytes)), keyVersion: version };
}

export async function decryptCredential(env: PicnicKeyEnv, ownerId: string, connectionId: string,
  purpose: CredentialPurpose, keyVersion: string, ciphertext: string): Promise<string> {
  const raw = keyMap(env).get(keyVersion);
  if (!raw) throw new Error('Credential key version unavailable');
  if (ciphertext.length > 8192) throw new Error('Invalid encrypted credential');
  const bytes = decodeBase64(ciphertext);
  if (bytes.byteLength < 29) throw new Error('Invalid encrypted credential');
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12),
    additionalData: aad(ownerId, connectionId, keyVersion, purpose), tagLength: 128 },
  await importAesKey(raw, ['decrypt']), bytes.slice(12));
  return new TextDecoder().decode(plaintext);
}
