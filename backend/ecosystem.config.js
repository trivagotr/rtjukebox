module.exports = {
    apps: [
        {
            name: 'radiotedu-backend',
            script: './dist/server.js',
            instances: 'max',
            exec_mode: 'cluster',
            autorestart: true,
            watch: false,
            max_memory_restart: '1G',
            env_production: {
                NODE_ENV: 'production',
            },
        },
    ],
};
