import { randomUUID } from 'node:crypto';
import { closeDatabase, pool } from '../src/db.js';
import { createViewerNpc, loadViewerNpcSnapshot, loadViewerNpcSnapshotByNpcId, verifySeedData } from '../src/repository.js';

async function main(): Promise<void> {
  const summary = await verifySeedData(pool);
  const tiktokId = `watch_${randomUUID()}`;
  const streamerHandle = 'streamer_a';

  const created = await createViewerNpc(pool, {
    streamerHandle,
    tiktokId,
    displayName: 'Watch Tester',
    npcName: 'Watch NPC',
    personalityPrompt: '公開視聴ページの検証用 NPC',
  });
  if (!created.created) {
    throw new Error('watch verification expected a newly created NPC');
  }

  const snapshotById = await loadViewerNpcSnapshotByNpcId(pool, streamerHandle, created.npc.npc.id);
  if (!snapshotById) {
    throw new Error('watch snapshot by npc id was not found');
  }

  if (snapshotById.npc.npc.id !== created.npc.npc.id) {
    throw new Error(`watch snapshot returned unexpected npc id: ${snapshotById.npc.npc.id}`);
  }

  if (snapshotById.viewerUser.tiktok_id !== tiktokId) {
    throw new Error(`watch snapshot returned unexpected tiktok id: ${snapshotById.viewerUser.tiktok_id}`);
  }

  const snapshotByTiktok = await loadViewerNpcSnapshot(pool, streamerHandle, tiktokId);
  if (!snapshotByTiktok) {
    throw new Error('watch snapshot by tiktok id was not found');
  }

  if (snapshotByTiktok.npc.npc.id !== created.npc.npc.id) {
    throw new Error(`my-npc snapshot returned unexpected npc id: ${snapshotByTiktok.npc.npc.id}`);
  }

  const crossTenant = await loadViewerNpcSnapshotByNpcId(pool, 'streamer_b', created.npc.npc.id);
  if (crossTenant) {
    throw new Error('cross-tenant watch snapshot should not be visible');
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        summary,
        streamerHandle,
        npcId: created.npc.npc.id,
        tiktokId,
        worldId: created.world.id,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
