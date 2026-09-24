import { createApp } from './app.js';
import { createCompositionRoot } from './composition-root.js';
import { logger } from './core/logging/logger.js';

const composition = createCompositionRoot();
const app = createApp(composition.apiRouter, composition.environment);
const server = app.listen(composition.environment.PORT, () => {
  logger.info({ port: composition.environment.PORT }, 'Backend server listening');
});

let isShuttingDown = false;

function shutdown(signal: NodeJS.Signals) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info({ signal }, 'Shutting down backend server');

  server.close((serverError) => {
    void composition.prisma
      .$disconnect()
      .then(() => {
        if (serverError) {
          logger.error({ err: serverError }, 'HTTP server shutdown failed');
          process.exitCode = 1;
        }
      })
      .catch((disconnectError: unknown) => {
        logger.error({ err: disconnectError }, 'Database shutdown failed');
        process.exitCode = 1;
      });
  });
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
