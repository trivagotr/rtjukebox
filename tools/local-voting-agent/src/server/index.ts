import { loadAgentConfig } from '../agent/config';
import { createBackendVotingClient } from '../agent/backendClient';
import { scanFolderCatalog, scanJingleCatalog } from '../agent/folderCatalog';
import { loadSongCatalog } from '../agent/songCatalog';
import { createApp } from './app';

const config = loadAgentConfig();
const songs = process.env.LOCAL_SONG_CATALOG
  ? loadSongCatalog(config.catalogPath, config.musicRoots)
  : scanFolderCatalog(config.musicRoots);
const jingles = scanJingleCatalog(config.jingleRoots);
const backendClient = createBackendVotingClient(config.backend);
const app = createApp({
  songs,
  jingles,
  candidateCount: config.candidateCount,
  playbackMode: config.playbackMode,
  jingleBeforeWinner: config.jingleBeforeWinner,
  backendClient,
});

app.listen(config.serverPort, '127.0.0.1', () => {
  console.log(`RadioTEDU local voting agent listening on http://127.0.0.1:${config.serverPort}`);
});
