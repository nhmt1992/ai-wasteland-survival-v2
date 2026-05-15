#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const cloudflaredVersion = '2025.8.1';
const cloudflaredDownloadUrl =
  `https://github.com/cloudflare/cloudflared/releases/download/${cloudflaredVersion}/cloudflared-windows-amd64.exe`;
const urlPattern = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/gi;

const managedChildren = new Map();
let cloudflaredBinaryPromise = null;
let shuttingDown = false;

function logLine(label, message) {
  process.stdout.write(`[${label}] ${message}\n`);
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isEnoentWindowsError(error) {
  return process.platform === 'win32'
    && error
    && typeof error === 'object'
    && 'code' in error
    && error.code === 'ENOENT';
}

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function ensureWindowsCloudflaredBinary() {
  if (!cloudflaredBinaryPromise) {
    cloudflaredBinaryPromise = (async () => {
      const cachedPath = resolve(tmpdir(), `cloudflared-${cloudflaredVersion}-windows-amd64.exe`);
      if (await pathExists(cachedPath)) {
        return cachedPath;
      }

      logLine('beta', `cloudflared not found, downloading ${cloudflaredVersion}...`);
      const response = await fetch(cloudflaredDownloadUrl);
      if (!response.ok) {
        throw new Error(`cloudflared download failed: ${response.status} ${response.statusText}`);
      }

      const bytes = Buffer.from(await response.arrayBuffer());
      await mkdir(dirname(cachedPath), { recursive: true });
      await writeFile(cachedPath, bytes);
      return cachedPath;
    })();
  }

  return cloudflaredBinaryPromise;
}

function spawnManaged(command, args, options) {
  const child = spawn(command, args, {
    cwd: repoRoot,
    env: {
      ...process.env,
      ...(options?.env ?? {}),
    },
    stdio: options?.stdio ?? 'inherit',
    shell: process.platform === 'win32',
    windowsHide: true,
  });

  managedChildren.set(child.pid ?? `${command}:${args.join(' ')}`, child);
  child.once('exit', (code, signal) => {
    for (const [key, current] of managedChildren.entries()) {
      if (current === child) {
        managedChildren.delete(key);
        break;
      }
    }

    if (!shuttingDown && options?.required && (code !== 0 || signal)) {
      logLine('beta', `${options.label ?? command} exited unexpectedly`);
      void shutdown(1);
    }
  });

  return child;
}

async function launchCloudflaredTunnel(label, targetUrl, command) {
  const child = spawn(command, ['tunnel', '--url', targetUrl, '--no-autoupdate'], {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    env: process.env,
  });

  managedChildren.set(`tunnel:${label}`, child);
  child.once('exit', (code, signal) => {
    for (const [key, current] of managedChildren.entries()) {
      if (current === child) {
        managedChildren.delete(key);
        break;
      }
    }

    if (!shuttingDown && (code !== 0 || signal)) {
      logLine('beta', `${label} exited unexpectedly`);
      void shutdown(1);
    }
  });

  return new Promise((resolve, reject) => {
    let resolvedUrl = null;
    let outputBuffer = '';

    const consume = (chunk) => {
      outputBuffer += chunk.toString('utf8');
      const lines = outputBuffer.split(/\r?\n/);
      outputBuffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line) {
          continue;
        }

        logLine(label, line);
        const matches = line.match(urlPattern);
        if (matches && matches.length > 0 && !resolvedUrl) {
          resolvedUrl = matches[0];
          resolve({ child, url: resolvedUrl });
        }
      }
    };

    child.stdout.on('data', consume);
    child.stderr.on('data', consume);
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (!resolvedUrl) {
        reject(new Error(`${label} tunnel exited before publishing a URL (code ${code ?? 'unknown'}, signal ${signal ?? 'none'})`));
      }
    });
  });
}

async function startCloudflaredTunnel(label, targetUrl) {
  const command = normalizeString(process.env.CLOUDFLARED_PATH) || 'cloudflared';
  try {
    return await launchCloudflaredTunnel(label, targetUrl, command);
  } catch (error) {
    if (!isEnoentWindowsError(error)) {
      throw error;
    }

    const fallbackPath = await ensureWindowsCloudflaredBinary();
    return launchCloudflaredTunnel(label, targetUrl, fallbackPath);
  }
}

function waitForHttpOk(url, label, attempts = 90, intervalMs = 1000) {
  return new Promise((resolve, reject) => {
    let remaining = attempts;

    const check = async () => {
      try {
        const response = await fetch(url);
        if (response.ok) {
          resolve();
          return;
        }
      } catch {
        // retry
      }

      remaining -= 1;
      if (remaining <= 0) {
        reject(new Error(`${label} did not become ready at ${url}`));
        return;
      }

      setTimeout(check, intervalMs);
    };

    void check();
  });
}

function startScript(label, workspace, script, extraEnv = {}) {
  logLine('beta', `starting ${label}`);
  const child = spawnManaged(
    npmCommand,
    ['--workspace', workspace, 'run', script],
    {
      env: extraEnv,
      label,
      required: true,
    },
  );

  return child;
}

function trackProcess(label, child) {
  logLine('beta', `${label} started (pid ${child.pid ?? 'unknown'})`);
}

async function shutdown(exitCode = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  logLine('beta', 'shutting down demo processes');

  for (const child of managedChildren.values()) {
    try {
      child.kill('SIGINT');
    } catch {
      // Ignore shutdown failures.
    }
  }

  await new Promise((resolve) => setTimeout(resolve, 1500));

  for (const child of managedChildren.values()) {
    try {
      if (!child.killed) {
        child.kill('SIGTERM');
      }
    } catch {
      // Ignore shutdown failures.
    }
  }

  process.exit(exitCode);
}

process.on('SIGINT', () => {
  void shutdown(130);
});

process.on('SIGTERM', () => {
  void shutdown(143);
});

async function main() {
  logLine('beta', 'resetting database');
  await new Promise((resolve, reject) => {
    const child = spawnManaged(npmCommand, ['--workspace', 'backend', 'run', 'db:init'], {
      label: 'db:init',
      required: true,
    });
    child.once('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`db:init exited with code ${code ?? 'unknown'}`));
      }
    });
  });

  await new Promise((resolve, reject) => {
    const child = spawnManaged(npmCommand, ['--workspace', 'backend', 'run', 'db:verify'], {
      label: 'db:verify',
      required: true,
    });
    child.once('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`db:verify exited with code ${code ?? 'unknown'}`));
      }
    });
  });

  logLine('beta', 'starting public tunnels');
  const streamerTunnelPromise = startCloudflaredTunnel('streamer-tunnel', 'http://localhost:5173');
  const overlayTunnelPromise = startCloudflaredTunnel('overlay-tunnel', 'http://localhost:5174');
  const viewerTunnelPromise = startCloudflaredTunnel('viewer-tunnel', 'http://localhost:5175');
  const adminTunnelPromise = startCloudflaredTunnel('admin-tunnel', 'http://localhost:5176');

  const [streamerTunnel, overlayTunnel, viewerTunnel, adminTunnel] = await Promise.all([
    streamerTunnelPromise,
    overlayTunnelPromise,
    viewerTunnelPromise,
    adminTunnelPromise,
  ]);

  const publicEnv = {
    PUBLIC_STREAMER_BASE_URL: streamerTunnel.url,
    PUBLIC_OVERLAY_BASE_URL: overlayTunnel.url,
    PUBLIC_VIEWER_BASE_URL: viewerTunnel.url,
  };

  logLine('beta', 'starting backend and frontends');
  const backend = startScript('backend', 'backend', 'dev', publicEnv);
  const streamer = startScript('streamer', 'frontend/streamer', 'dev');
  const overlay = startScript('overlay', 'frontend/overlay', 'dev');
  const viewer = startScript('viewer', 'frontend/viewer', 'dev');
  const admin = startScript('admin', 'frontend/admin', 'dev');

  trackProcess('backend', backend);
  trackProcess('streamer', streamer);
  trackProcess('overlay', overlay);
  trackProcess('viewer', viewer);
  trackProcess('admin', admin);

  await Promise.all([
    waitForHttpOk('http://127.0.0.1:3000/health', 'backend health'),
    waitForHttpOk('http://127.0.0.1:5173/', 'streamer console'),
    waitForHttpOk('http://127.0.0.1:5174/', 'overlay'),
    waitForHttpOk('http://127.0.0.1:5175/', 'viewer'),
    waitForHttpOk('http://127.0.0.1:5176/', 'admin'),
  ]);

  const publicTunnelProbes = [
    { label: 'streamer tunnel', url: streamerTunnel.url },
    { label: 'overlay tunnel', url: overlayTunnel.url },
    { label: 'viewer tunnel', url: viewerTunnel.url },
    { label: 'admin tunnel', url: adminTunnel.url },
  ];

  for (const probe of publicTunnelProbes) {
    try {
      await waitForHttpOk(probe.url, probe.label, 15, 2000);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logLine('beta', `${probe.label} probe skipped: ${message}`);
    }
  }

  logLine('beta', 'demo is ready');
  process.stdout.write('\n');
  console.log(
    JSON.stringify(
      {
        ok: true,
        backend: 'http://127.0.0.1:3000',
        streamer: 'http://127.0.0.1:5173',
        overlay: 'http://127.0.0.1:5174',
        viewer: 'http://127.0.0.1:5175',
        admin: 'http://127.0.0.1:5176',
        tunnels: {
          streamer: streamerTunnel.url,
          overlay: overlayTunnel.url,
          viewer: viewerTunnel.url,
          admin: adminTunnel.url,
        },
        credentials: {
          matt: 'matt / matt-demo-123',
          streamerA: 'streamer_a / streamer-a-123',
          streamerB: 'streamer_b / streamer-b-123',
          admin: 'admin@example.com / admin-demo-123',
        },
      },
      null,
      2,
    ),
  );

  const monitorChildren = [backend, streamer, overlay, viewer, admin];
  for (const child of monitorChildren) {
    child.once('exit', (code, signal) => {
      if (!shuttingDown) {
        logLine('beta', `a required process exited (code ${code ?? 'unknown'}, signal ${signal ?? 'none'})`);
        void shutdown(code ?? 1);
      }
    });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  void shutdown(1);
});
