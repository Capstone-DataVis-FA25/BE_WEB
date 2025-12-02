module.exports = {
  apps: [
    {
      name: 'be-datavis', // Tên ứng dụng hiển thị trong PM2
      script: '/home/datavis/BE_WEB/dist/main.js', // File sau khi build NestJS
      cwd: '/home/datavis/BE_WEB', // Đường dẫn tuyệt đối đến source
      instances: 1, // Có thể tăng lên nếu VPS mạnh (cluster mode)
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',

      // Environment mặc định (khi chạy pm2 start ecosystem.config.js)
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
      },

      // Environment khi chạy với --env production
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,

        // Database
        DATABASE_URL: process.env.DATABASE_URL,
        DATABASE_HOST: process.env.DATABASE_HOST,
        DATABASE_PORT: process.env.DATABASE_PORT,
        DATABASE_USER: process.env.DATABASE_USER,
        DATABASE_PASSWORD: process.env.DATABASE_PASSWORD,
        DATABASE_NAME: process.env.DATABASE_NAME,

        // Public URLs
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
      },
    },
  ],
};
