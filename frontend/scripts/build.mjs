import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const src = path.join(root, 'src');
const dist = path.join(root, 'dist');

async function loadLocalEnv() {
  try {
    const content = await fs.readFile(path.join(root, '.env'), 'utf8');
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const separator = line.indexOf('=');
      if (separator < 1) continue;

      const key = line.slice(0, separator).trim();
      let value = line.slice(separator + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"'))
        || (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      if (!process.env[key]) process.env[key] = value;
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

await loadLocalEnv();

const apiBase = String(process.env.API_BASE_URL || '').trim();

if (!apiBase) {
  throw new Error('Missing API_BASE_URL environment variable. Example: https://YOUR-RENDER-SERVICE.onrender.com/api');
}

await fs.rm(dist, { recursive: true, force: true });
await fs.cp(src, dist, { recursive: true });

const config = `window.APP_CONFIG = ${JSON.stringify({ API_BASE_URL: apiBase })};\n`;
await fs.writeFile(path.join(dist, 'config.js'), config, 'utf8');

console.log(`Built frontend to ${dist}`);
console.log(`API_BASE_URL=${apiBase}`);
