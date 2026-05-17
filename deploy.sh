#!/bin/bash
# ============================================
# 搭搭后端服务 - 一键部署脚本
# 服务器：百度云 106.12.152.131
# 使用：ssh 到服务器后执行 bash deploy.sh
# ============================================

set -e

echo "========================================"
echo "  搭搭后端服务部署"
echo "========================================"

# ---- 配置区域 ----
DOMAIN="api.cyberpm.tech"     # API 域名（需已解析到 106.12.152.131）
# --------------------------

# 1. 安装 Node.js
echo "[1/6] 检查 Node.js..."
if ! command -v node &> /dev/null; then
  echo "安装 Node.js 18..."
  curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
echo "Node.js: $(node -v), npm: $(npm -v)"

# 2. 安装 Nginx
echo "[2/6] 检查 Nginx..."
if ! command -v nginx &> /dev/null; then
  echo "安装 Nginx..."
  sudo apt-get update
  sudo apt-get install -y nginx
fi

# 3. 安装 pm2
echo "[3/6] 检查 pm2..."
if ! command -v pm2 &> /dev/null; then
  echo "安装 pm2..."
  sudo npm install -g pm2
fi

# 4. 拉取代码
echo "[4/6] 拉取代码..."
if [ -d "/opt/dada-server" ]; then
  cd /opt/dada-server
  git pull origin main
else
  sudo mkdir -p /opt/dada-server
  sudo chown $USER:$USER /opt/dada-server
  git clone https://github.com/PMTuzi/DaDaWX.git /opt/dada-server
  cd /opt/dada-server/server
fi

cd /opt/dada-server/server
npm install --production

# 5. 配置 .env（如果不存在）
if [ ! -f ".env" ]; then
  echo ""
  echo "⚠️  未找到 .env 文件，请手动配置："
  echo "   vim /opt/dada-server/server/.env"
  echo ""
  echo "   需要配置："
  echo "   - OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET"
  echo "   - QWEN_API_KEY"
  echo "   - WX_APPID / WX_SECRET"
  echo ""
  read -p "是否现在编辑 .env？(y/n): " EDIT_ENV
  if [ "$EDIT_ENV" = "y" ]; then
    cp .env.example .env 2>/dev/null || true
    vim .env
  fi
fi

# 6. 启动服务
echo "[5/6] 启动服务..."
pm2 delete dada-server 2>/dev/null || true
pm2 start server.js --name dada-server
pm2 save

# 设置开机自启
pm2 startup | tail -1 | sudo bash || true

echo "[6/6] 配置 Nginx + SSL..."

# 安装 certbot
if ! command -v certbot &> /dev/null; then
  echo "安装 certbot..."
  sudo apt-get install -y certbot python3-certbot-nginx
fi

# HTTP 配置（先用于申请证书）
cat > /tmp/dada-server.conf << 'EOF'
server {
    listen 80;
    server_name api.cyberpm.tech;
    client_max_body_size 20m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}
EOF

sudo cp /tmp/dada-server.conf /etc/nginx/sites-available/dada-server
sudo ln -sf /etc/nginx/sites-available/dada-server /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

# 申请 SSL 证书
echo ""
echo "⚠️  请确保 api.cyberpm.tech 的 DNS A 记录已指向 106.12.152.131"
read -p "DNS 已解析？开始申请 SSL 证书？(y/n): " DO_SSL
if [ "$DO_SSL" = "y" ]; then
  sudo certbot --nginx -d api.cyberpm.tech --non-interactive --agree-tos --register-unsafely-without-email
  echo "✅ SSL 证书已安装，HTTPS 已启用"
else
  echo "⚠️  跳过 SSL，稍后可手动执行："
  echo "   sudo certbot --nginx -d api.cyberpm.tech"
fi

echo ""
echo "========================================"
echo "  ✅ 部署完成！"
echo "========================================"
echo ""
echo "  HTTP 访问:  http://106.12.152.131"
echo "  域名访问:   https://api.cyberpm.tech"
echo "  健康检查:   https://api.cyberpm.tech/api/health"
echo ""
echo "  ⚠️  还需要："
echo "  1. 在域名 DNS 添加 A 记录：api.cyberpm.tech → 106.12.152.131"
echo "  2. 如跳过 SSL，手动执行：sudo certbot --nginx -d api.cyberpm.tech"
echo "  3. 微信后台 → 开发管理 → 服务器域名 → 添加 https://api.cyberpm.tech"
echo "  4. 阿里云 OSS 跨域配置：允许 https://api.cyberpm.tech"
echo ""
echo "  常用命令："
echo "  pm2 logs dada-server    # 查看日志"
echo "  pm2 restart dada-server # 重启服务"
echo "  pm2 status              # 查看状态"
echo "========================================"
