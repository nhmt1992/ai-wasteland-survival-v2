#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const TUNNEL_VERSION = '2025.8.1';
const TUNNEL_DOWNLOAD_URL =
  `https://github.com/cloudflare/cloudflared/releases/download/${TUNNEL_VERSION}/cloudflared-windows-amd64.exe`;

function printUsageAndExit() {
  console.error('使用方法: node scripts/run-cloudflared-tunnel.mjs <target-url>');
  process.exit(1);
}

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function spawnTunnel(command, args) {
  return spawn(command, args, {
    stdio: 'inherit',
    windowsHide: true,
  });
}

async function ensureWindowsBinary() {
  const cachedPath = join(tmpdir(), `cloudflared-${TUNNEL_VERSION}-windows-amd64.exe`);
  if (await pathExists(cachedPath)) {
    return cachedPath;
  }

  const response = await fetch(TUNNEL_DOWNLOAD_URL);
  if (!response.ok) {
    throw new Error(`cloudflared 下载失败: ${response.status} ${response.statusText}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  await mkdir(dirname(cachedPath), { recursive: true });
  await writeFile(cachedPath, bytes);
  return cachedPath;
}

function waitForExit(child) {
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      resolve({ code: code ?? 1, signal });
    });
  });
}

async function runTunnel(command, args) {
  const child = spawnTunnel(command, args);
  try {
    const result = await waitForExit(child);
    return result.code;
  } catch (error) {
    const errorCode = error && typeof error === 'object' && 'code' in error ? error.code : null;
    if (process.platform !== 'win32' || errorCode !== 'ENOENT') {
      throw error;
    }

    const fallbackPath = await ensureWindowsBinary();
    const fallbackChild = spawnTunnel(fallbackPath, args);
    const fallbackResult = await waitForExit(fallbackChild);
    return fallbackResult.code;
  }
}

async function main() {
  const targetUrl = process.argv[2]?.trim();
  if (!targetUrl) {
    printUsageAndExit();
  }

  const command = process.env.CLOUDFLARED_PATH?.trim() || 'cloudflared';
  const exitCode = await runTunnel(command, ['tunnel', '--url', targetUrl, '--no-autoupdate']);
  process.exit(exitCode);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
