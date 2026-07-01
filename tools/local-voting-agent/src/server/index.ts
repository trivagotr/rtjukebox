import { loadAgentConfig } from '../agent/config';
import { loadSongCatalog } from '../agent/songCatalog';
import { createApp } from './app';

const config = loadAgentConfig();
const songs = loadSongCatalog(config.catalogPath, config.musicRoots);
const app = createApp({ songs, candidateCount: config.candidateCount });

app.listen(config.serverPort, '127.0.0.1', () => {
  console.log(`RadioTEDU local voting agent listening on http://127.0.0.1:${config.serverPort}`);
});
