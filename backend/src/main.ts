import Fastify from 'fastify';
import cors from '@fastify/cors';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const app = Fastify({ logger: true });
const port = Number(process.env.PORT ?? 3000);

await app.register(cors, {
  origin: true,
});

app.get('/health', async () => {
  return {
    ok: true,
    service: 'ai-wasteland-survival-v2-backend',
    version: '0.1.0',
  };
});

app.get('/api/streamers/:handle', async (request) => {
  const params = z.object({ handle: z.string().min(1) }).parse(request.params);

  return {
    handle: params.handle,
    displayName: 'マット',
    tenantHandle: params.handle,
    plan: 'free_trial',
    status: 'active',
  };
});

app.get('/api/streamers/:handle/worlds', async (request) => {
  const params = z.object({ handle: z.string().min(1) }).parse(request.params);

  return {
    streamerHandle: params.handle,
    worlds: [
      {
        id: process.env.DEFAULT_WORLD_ID ?? '00000000-0000-0000-0000-000000000101',
        name: '荒土世界 Alpha',
        status: 'active',
        width: 64,
        height: 64,
        aliveNpcCount: 5,
        deadNpcCount: 0,
      },
    ],
  };
});

app.post('/api/streamers/:handle/live-sessions', async (request) => {
  const params = z.object({ handle: z.string().min(1) }).parse(request.params);

  return {
    id: 'dev-live-session',
    streamerHandle: params.handle,
    status: 'created',
    overlayUrl: `http://localhost:5174/overlay/${params.handle}/default-world`,
    createUrl: `http://localhost:5175/s/${params.handle}/create`,
  };
});

app.get('/api/worlds/:worldId/snapshot', async (request) => {
  const params = z.object({ worldId: z.string().min(1) }).parse(request.params);

  return {
    world: {
      id: params.worldId,
      name: '荒土世界 Alpha',
      width: 64,
      height: 64,
      tick: 0,
      status: 'active',
    },
    npcs: [
      {
        id: 'npc-demo-1',
        name: 'レン',
        tileX: 32,
        tileY: 32,
        hp: 100,
        food: 70,
        water: 70,
        stamina: 100,
        status: 'alive',
        currentAction: 'idle',
      },
    ],
    events: [],
  };
});

app.post('/api/dev/gift-events', async (request) => {
  const body = z
    .object({
      streamerHandle: z.string().min(1),
      tiktokId: z.string().min(1),
      giftName: z.string().min(1),
      giftValue: z.number().int().nonnegative().default(1),
      repeatCount: z.number().int().positive().default(1),
    })
    .parse(request.body);

  return {
    accepted: true,
    source: 'DevMockGiftAdapter',
    normalized: body,
  };
});

app.post('/api/dev/tick', async () => {
  return {
    accepted: true,
    message: 'Manual tick placeholder executed.',
  };
});

app.listen({ port, host: '0.0.0.0' });
