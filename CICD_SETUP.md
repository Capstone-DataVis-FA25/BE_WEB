# Hướng dẫn Setup GitHub Secrets cho CI/CD

## 1. Tạo SSH Key trên VPS

```bash
# Trên VPS
ssh-keygen -t ed25519 -C "deploy-key"
cat ~/.ssh/id_ed25519      # Private key (lưu vào GitHub Secret)
cat ~/.ssh/id_ed25519.pub  # Public key (thêm vào authorized_keys)
```

## 2. Thêm Secrets vào GitHub Repository

Vào repository GitHub → Settings → Secrets and variables → Actions → New repository secret

### Backend Secrets:
- `BE_VPS_HOST`: be.datavis.site
- `VPS_USERNAME`: ubuntu
- `VPS_SSH_KEY`: (nội dung file private key)

### Frontend Secrets:
- `FE_VPS_HOST`: datavis.site
- `VPS_USERNAME`: ubuntu
- `VPS_SSH_KEY`: (nội dung file private key)
- `VITE_API_BASE_URL`: https://be.datavis.site
- `VITE_GOOGLE_CLIENT_ID`: your-google-client-id

## 3. Test Manual Trigger

Vào Actions tab → Chọn workflow → Run workflow → Run

## 4. Auto Deploy Flow

```
Push code to main branch
    ↓
GitHub Actions triggered
    ↓
Build & Test (if any)
    ↓
SSH to VPS
    ↓
Pull code, install, build
    ↓
Reload PM2 / Nginx
    ↓
✅ Deployed
```

## 5. Rollback nếu cần

```bash
# SSH vào VPS
cd /var/www/be-datavis  # hoặc fe-datavis

# Xem git log
git log --oneline -10

# Rollback về commit trước
git reset --hard <commit-hash>

# Build lại
npm install && npm run build

# Reload PM2
pm2 reload be-datavis
```
