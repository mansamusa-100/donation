import 'dotenv/config';
import { env } from './config/env.js';
import { app } from './app.js';
import { ensurePlatformOwner } from './lib/ensurePlatformOwner.js';
import { ensurePlatformStat } from './lib/ensurePlatformStat.js';

async function start() {
  await ensurePlatformStat();
  await ensurePlatformOwner();
  app.listen(env.PORT, () => {
    console.log(`BarakahFund API listening on http://localhost:${env.PORT}`);
  });
}

start().catch((error) => {
  console.error('Failed to start BarakahFund API:', error);
  process.exit(1);
});
