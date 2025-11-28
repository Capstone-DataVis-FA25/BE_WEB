# Hướng dẫn CI/CD Backend với PM2

## 1. Chuẩn bị VPS

### 1.1. Cài đặt môi trường trên VPS
```bash
# SSH vào VPS
ssh ubuntu@be.datavis.site

# Update system
sudo apt update && sudo apt upgrade -y

# Cài Node.js (v18 hoặc v20)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Cài PM2 global
sudo npm install -g pm2

# Cài Git
sudo apt install git -y

# Cài nginx (reverse proxy)
sudo apt install nginx -y
```

### 1.2. Setup SSH Keys cho GitHub
```bash
# Tạo SSH key trên VPS
ssh-keygen -t ed25519 -C "your_email@example.com"

# Copy public key
cat ~/.ssh/id_ed25519.pub

# Thêm key này vào GitHub:
# Settings -> SSH and GPG keys -> New SSH key
```

## 2. Setup Backend

### 2.1. Tạo thư mục và clone repo
```bash
# Tạo thư mục
sudo mkdir -p /var/www/be-datavis
sudo chown -R ubuntu:ubuntu /var/www/be-datavis

# Clone repo
cd /var/www
git clone git@github.com:Capstone-DataVis-FA25/BE_WEB.git be-datavis
cd be-datavis
```

### 2.2. Cấu hình môi trường production
```bash
# Tạo file .env.production
nano .env.production
```

Nội dung file `.env.production`:
```env
NODE_ENV=production
PORT=1011

# Database (Production)
DATABASE_URL="postgresql://user:pass@host:5432/dbname?sslmode=require"
DATABASE_HOST=your-prod-db-host
DATABASE_PORT=5432
DATABASE_USER=your-prod-user
DATABASE_PASSWORD=your-prod-password
DATABASE_NAME=DataVis

# URLs
API_URL=https://be.datavis.site
CLIENT_URL=https://datavis.site
FRONTEND_URL=https://datavis.site

# Google OAuth
GOOGLE_CLIENT_ID=your-prod-google-client-id
GOOGLE_CLIENT_SECRET=your-prod-google-secret
GOOGLE_CALLBACK_URL=https://be.datavis.site/auth/google/callback

# Email
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USER=your-email@gmail.com
MAIL_PASS=your-app-password

# JWT
JWT_ACCESS_TOKEN_EXPIRATION_TIME=3600
JWT_REFRESH_TOKEN_EXPIRATION_TIME=2592000

# AWS KMS
AWS_REGION=ap-southeast-1
AWS_KMS_KEY_ID=your-kms-key-id
AWS_ACCESS_KEY_ID=your-aws-key
AWS_SECRET_ACCESS_KEY=your-aws-secret

# Cloudinary
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
CLOUDINARY_FOLDER=datavis

# AI
OPENROUTER_API_KEY=your-openrouter-key
OPENAI_API_KEY=your-openai-key

# Payment
PAYOS_CLIENT_ID=your-payos-client-id
PAYOS_API_KEY=your-payos-api-key
PAYOS_CHECKSUM_KEY=your-payos-checksum-key
```

### 2.3. Build và chạy lần đầu
```bash
# Cài dependencies
npm install

# Build project
npm run build

# Chạy Prisma migrations
npx prisma migrate deploy

# Khởi động PM2 với production env
pm2 start ecosystem.config.js --env production

# Lưu danh sách PM2
pm2 save

# Setup PM2 startup (tự động chạy khi reboot)
pm2 startup
# Copy và chạy lệnh được gợi ý
```

### 2.4. Cấu hình Nginx reverse proxy
```bash
sudo nano /etc/nginx/sites-available/be-datavis
```

Nội dung:
```nginx
server {
    listen 80;
    server_name be.datavis.site;

    location / {
        proxy_pass http://localhost:1011;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Tăng timeout cho upload
        client_max_body_size 50M;
        proxy_connect_timeout 600;
        proxy_send_timeout 600;
        proxy_read_timeout 600;
        send_timeout 600;
    }
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/be-datavis /etc/nginx/sites-enabled/

# Test config
sudo nginx -t

# Restart nginx
sudo systemctl restart nginx
```

### 2.5. Setup SSL với Let's Encrypt
```bash
# Cài Certbot
sudo apt install certbot python3-certbot-nginx -y

# Tạo SSL certificate
sudo certbot --nginx -d be.datavis.site

# Auto-renew sẽ được setup tự động
```

## 3. Deploy tự động với PM2

### 3.1. Từ máy local
```bash
# Setup deploy lần đầu
pm2 deploy ecosystem.config.js production setup

# Deploy code mới
pm2 deploy ecosystem.config.js production
```

### 3.2. Hoặc deploy thủ công trên VPS
```bash
cd /var/www/be-datavis

# Pull code mới
git pull origin main

# Cài dependencies nếu có thay đổi
npm install

# Build lại
npm run build

# Chạy migrations nếu có
npx prisma migrate deploy

# Reload PM2
pm2 reload ecosystem.config.js --env production
```

## 4. CI/CD với GitHub Actions (Tự động)

Tạo file `.github/workflows/deploy-backend.yml`:

```yaml
name: Deploy Backend

on:
  push:
    branches: [ main ]
    paths:
      - 'BE_WEB/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to VPS
        uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USERNAME }}
          key: ${{ secrets.VPS_SSH_KEY }}
          script: |
            cd /var/www/be-datavis
            git pull origin main
            npm install
            npm run build
            npx prisma migrate deploy
            pm2 reload ecosystem.config.js --env production
```

## 5. Monitoring và Logs

```bash
# Xem status
pm2 status

# Xem logs
pm2 logs be-datavis

# Xem logs real-time
pm2 logs be-datavis --lines 100

# Xem monitoring
pm2 monit

# Restart app
pm2 restart be-datavis

# Reload app (zero-downtime)
pm2 reload be-datavis

# Stop app
pm2 stop be-datavis
```

## 6. Troubleshooting

### Check logs
```bash
# PM2 logs
pm2 logs be-datavis --err

# Nginx logs
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/access.log

# System logs
journalctl -u nginx -f
```

### Kiểm tra port
```bash
sudo lsof -i :1011
netstat -tulpn | grep 1011
```

### Restart services
```bash
# Restart PM2
pm2 restart all

# Restart Nginx
sudo systemctl restart nginx

# Reboot server
sudo reboot
```
