const path = require('path');
const {runSchemaMigration} = require('./migrate');

const MIGRATION_NAME = '20260714_native_radio_agent_voting';
const migrationPath = path.resolve(__dirname, 'migrations', `${MIGRATION_NAME}.sql`);

runSchemaMigration({schemaPath: migrationPath})
  .then(() => {
    console.log(`Migration ${MIGRATION_NAME} completed successfully.`);
    process.exit(0);
  })
  .catch((error) => {
    const code = typeof error?.code === 'string' ? error.code : 'migration_failed';
    console.error(`Migration ${MIGRATION_NAME} failed (${code}).`);
    process.exit(1);
  });
