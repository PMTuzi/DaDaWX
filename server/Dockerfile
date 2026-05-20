FROM node:18

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm config set registry https://registry.npmmirror.com && npm install --production

# 验证关键依赖已安装
RUN node -e "require('dotenv'); require('express'); require('cors'); console.log('依赖验证通过')"

COPY . .

RUN mkdir -p data uploads

EXPOSE 3000

CMD ["node", "server.js"]
