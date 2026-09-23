const { server } = require('./mswServer');
const { afterAll, afterEach, beforeAll } = require('@jest/globals');

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
