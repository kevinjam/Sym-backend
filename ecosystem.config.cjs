/**
 * PM2 process file — matches GitHub Actions deploy name `sym-backend`.
 *
 * Usage:
 *   pm2 start ecosystem.config.cjs --env production
 *   pm2 reload sym-backend --update-env
 *
 * Secrets stay in `.env` on the server (loaded by dotenv in server.js).
 */
module.exports = {
  apps: [
    {
      name: 'sym-backend',
      script: './server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      merge_logs: true,
      time: true,

      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },
    },
  ],
};
