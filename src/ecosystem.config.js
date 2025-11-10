module.exports = {
  apps: [
    {
      name: 'be-datavis',
      script: 'dist/main.js', // file NestJS sau khi build
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
        // Database
        DATABASE_URL: process.env.DATABASE_URL,
        DATABASE_HOST: process.env.DATABASE_HOST,
        DATABASE_PORT: process.env.DATABASE_PORT,
        DATABASE_USER: process.env.DATABASE_USER,
        DATABASE_PASSWORD: process.env.DATABASE_PASSWORD,
        DATABASE_NAME: process.env.DATABASE_NAME,
        // Public / Client URLs
        API_URL: process.env.API_URL,
        CLIENT_URL: process.env.CLIENT_URL,
        FRONTEND_URL: process.env.FRONTEND_URL,
        // Google OAuth
        GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
        GOOGLE_CALLBACK_URL: process.env.GOOGLE_CALLBACK_URL,
        // Email
        MAIL_HOST: process.env.MAIL_HOST,
        MAIL_PORT: process.env.MAIL_PORT,
        MAIL_USER: process.env.MAIL_USER,
        MAIL_PASS: process.env.MAIL_PASS,
        // Cache / Redis
        REDIS_URL: process.env.REDIS_URL,
        // AWS / KMS
        AWS_REGION: process.env.AWS_REGION,
        AWS_KMS_KEY_ID: process.env.AWS_KMS_KEY_ID,
        AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
        AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
        // AI / External APIs
        OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
        OPENAI_MODEL: process.env.OPENAI_MODEL,
        // Payment / other keys
        PAYOS_CLIENT_ID: process.env.PAYOS_CLIENT_ID,
        PAYOS_API_KEY: process.env.PAYOS_API_KEY,
        PAYOS_CHECKSUM_KEY: process.env.PAYOS_CHECKSUM_KEY,
        // JWT / App settings
        JWT_ACCESS_TOKEN_EXPIRATION_TIME: process.env.JWT_ACCESS_TOKEN_EXPIRATION_TIME,
        JWT_REFRESH_TOKEN_EXPIRATION_TIME: process.env.JWT_REFRESH_TOKEN_EXPIRATION_TIME,
      },
    },
  ],

  deploy: {
    production: {
      user: 'ubuntu', // hoặc root tùy VPS
      host: 'be.datavis.site', // domain hoặc IP của server
      ref: 'origin/main', // branch bạn muốn deploy
      repo: 'git@github.com:Capstone-DataVis-FA25/BE_WEB.git',
      path: '/var/www/be-datavis',
      'post-deploy':
        'npm install && npm run build && pm2 reload ecosystem.config.js --env production',
      env: {
        NODE_ENV: 'production',
      },
    },
  },
};
