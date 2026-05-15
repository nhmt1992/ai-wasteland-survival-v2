import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const repoRootEnvPath = path.resolve(moduleDir, '../../.env');

dotenv.config({
  path: fs.existsSync(repoRootEnvPath) ? repoRootEnvPath : undefined,
});

const EnvSchema = z.object({
  NODE_ENV: z.string().optional(),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  DEFAULT_TENANT_HANDLE: z.string().min(1).default('matt'),
  DEFAULT_STREAMER_HANDLE: z.string().min(1).default('matt'),
  DEFAULT_WORLD_ID: z.string().min(1).default('00000000-0000-0000-0000-000000000101'),
  PUBLIC_STREAMER_BASE_URL: z.string().min(1).default('http://localhost:5173'),
  PUBLIC_OVERLAY_BASE_URL: z.string().min(1).default('http://localhost:5174'),
  PUBLIC_VIEWER_BASE_URL: z.string().min(1).default('http://localhost:5175'),
  CORS_ORIGIN: z.string().default('http://localhost:5173,http://localhost:5174,http://localhost:5175'),
  ENABLE_TICK_SCHEDULER: z.string().default('true'),
  TICK_CHECK_INTERVAL_SECONDS: z.coerce.number().int().positive().default(30),
  LIVE_WORLD_TICK_INTERVAL_SECONDS: z.coerce.number().int().positive().default(60),
  ACTIVE_WORLD_TICK_INTERVAL_SECONDS: z.coerce.number().int().positive().default(300),
});

const parsedEnv = EnvSchema.parse(process.env);

export const env = {
  ...parsedEnv,
  enableTickScheduler: parsedEnv.ENABLE_TICK_SCHEDULER !== 'false',
  corsOrigins: parsedEnv.CORS_ORIGIN.split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0),
};

export type Env = typeof env;
