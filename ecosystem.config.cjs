/**
 * PM2 process file for production VPS (/var/www/sym-backend).
 *
 * Start / reload:
 *   pm2 start ecosystem.config.cjs --env production
 *   pm2 reload ecosystem.config.cjs --env production --update-env
 */
module.exports = {
  apps: [
    {
      name: 'sym-backend',
      script: 'server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
        // Optional override; server.js also auto-picks .env.production when it has Atlas URI.
        ENV_FILE: '.env.production',
      },
    },
  ],
};
