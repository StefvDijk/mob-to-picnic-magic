import fs from 'fs';
import path from 'path';

const DEFAULT_THRESHOLD = 0.72;

function loadEnvFile() {
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    if (!fs.existsSync(envPath)) {
      return;
    }
    const content = fs.readFileSync(envPath, 'utf-8');
    content.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const [key, ...rest] = trimmed.split('=');
      if (!key) return;
      const value = rest.join('=').trim();
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    });
  } catch (error) {
    console.warn('Kon .env niet laden:', error.message || error);
  }
}

loadEnvFile();

export const config = {
  picnic: {
    email: process.env.PICNIC_EMAIL || '',
    password: process.env.PICNIC_PASSWORD || '',
  },
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  autoAddThreshold: Number.isFinite(Number(process.env.AUTO_ADD_THRESHOLD))
    ? Number(process.env.AUTO_ADD_THRESHOLD)
    : DEFAULT_THRESHOLD,
  port: Number(process.env.PORT) || 3000,
};

export function resolveAutoAddThreshold(requestedThreshold) {
  if (typeof requestedThreshold === 'number' && !Number.isNaN(requestedThreshold)) {
    return requestedThreshold;
  }
  return config.autoAddThreshold;
}
