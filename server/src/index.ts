import { createPool } from './db';
import { createFirebaseAuthVerifier } from './firebase-admin';
import { createArenaXServer } from './app';

const port = Number(process.env['PORT'] || 3000);
const db = createPool();
const authVerifier = createFirebaseAuthVerifier();
const { httpServer } = createArenaXServer({ db, authVerifier });

httpServer.listen(port, () => {
  console.log(`ArenaX backend listening on ${port}`);
});
