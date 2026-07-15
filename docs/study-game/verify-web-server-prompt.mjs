import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const promptPath = path.join(scriptDir, 'WEB_SERVER_CODEX_PROMPT.md');
const prompt = fs.readFileSync(promptPath, 'utf8');

const required = [
  '- [ ]',
  'Juke-local / Jukebox project',
  'Voting project',
  'Study project',
  'Account platform',
  'Gold economy',
  'https://radiotedu.com/juke-local/controller/',
  '/jukebox/api/v1/next-song-voting/rounds/active',
  '/jukebox/socket.io',
  'https://radiotedu.com/study/',
  '/jukebox/api/v1/study',
  'spendable_points',
  'lifetime_points',
  'points_ledger',
  'idempotency',
  'account deletion',
  'rollback',
  'NEVER AND NEVER DELETE OR NUKE RADIOTEDU.COM FILES',
  'NEVER AND NEVER DELETE AND NUKE RADIOTEDU.COM FILES, PERSONAL ACCOUNTS (WHERE RADIOTEDU STUFF DETAILS ARE THERE, most @tedu.edu.tr accounts) AND WORDPRESS PAGES.',
  'most @tedu.edu.tr accounts',
  'WordPress pages',
  'mobile-only touch game',
  'tap-to-move',
  'tap-to-sit',
  'A*',
  '/jukebox/api/v1/study/instances/join',
  'library-2',
  'chim-alan-2',
  'clientSessionId',
  'instance-scoped',
  'Room N · occupancy/capacity',
  'Do not change the structure where you get the information from Music PC when voting, if you can communicate to Music PC. Just change the way you communicate with the mobile app. If you can talk to that, do not change.',
];

for (const text of required) {
  if (!prompt.includes(text)) {
    throw new Error(`Missing prompt contract: ${text}`);
  }
}

if (/<STUDY_COMMIT_SHA>|\bTBD\b|\bTODO\b/.test(prompt)) {
  throw new Error('Prompt contains an unresolved placeholder');
}

console.log('Web-server prompt contract verified.');
