# 搭搭 - AI 形象决策平台

> 国内首款「反种草」AI 形象决策平台 · 微信小程序

## 产品简介

搭搭是一款基于 AI 大模型（通义千问）的个人形象诊断与穿搭决策工具。用户只需上传一张照片，即可获得包含脸型分析、肤色诊断、风格判定、身形适配、穿搭推荐、发型推荐、妆容指南等 9 大板块的专业形象报告。

## 核心架构

```
用户提交照片
  ↓
图片上传 OSS（7天自动清理）
  ↓
通义千问-VL（qwen-vl-max）：提取视觉特征
  ↓
特征 + 用户标签 + 量化指标 → 构建 Prompt
  ↓
通义千问4.0（qwen-max）：结构化 JSON 输出
  ↓
校验输出格式 → 异常重试1次 → 仍异常返回兜底结果
```

## 项目结构

```
搭搭/
├── app.js                    # 小程序入口
├── app.json                  # 小程序配置
├── app.wxss                  # 全局样式
├── project.config.json       # 项目配置
├── sitemap.json
├── images/                   # TabBar 图标（需替换）
├── utils/
│   ├── api.js                # API 请求封装 & OSS上传
│   ├── format.js             # 格式化工具
│   └── report-schema.js      # 报告校验与兜底
├── pages/
│   ├── index/                # 首页（入口页）
│   ├── diagnose/             # AI 诊断 - 拍照上传
│   ├── analyzing/            # AI 分析动画页
│   ├── report/               # 诊断报告（9大板块）
│   ├── report-detail/        # 报告板块详情
│   ├── hairstyle/            # 发型推荐
│   ├── outfit/               # 穿搭推荐
│   ├── makeup/               # 妆容指南
│   ├── mine/                 # 个人中心
│   ├── reports/              # 历史报告
│   └── favorites/            # 我的收藏
└── server/                   # 后端服务
    ├── server.js             # Express 服务入口
    ├── package.json
    ├── .env.example          # 环境变量模板
    ├── routes/
    │   ├── oss.js            # OSS 上传凭证
    │   ├── ai.js             # AI 诊断接口
    │   ├── report.js         # 报告CRUD
    │   ├── user.js           # 微信登录
    │   └── favorite.js       # 收藏管理
    ├── services/
    │   └── qwen.js           # 通义千问 API 调用
    └── utils/
        └── report-schema.js  # 报告校验与兜底
```

## 部署指南

### 1. 后端服务

```bash
cd server
cp .env.example .env
# 编辑 .env 填入阿里云和微信配置
npm install
npm start
```

需要配置的环境变量：
- `OSS_ACCESS_KEY_ID` / `OSS_ACCESS_KEY_SECRET` - 阿里云 OSS
- `QWEN_API_KEY` - 通义千问 API Key
- `WX_APPID` / `WX_SECRET` - 微信小程序配置

### 2. 小程序

1. 使用微信开发者工具打开项目根目录
2. 替换 `images/` 下的 TabBar 图标
3. 修改 `utils/api.js` 中的 `baseUrl` 为后端服务地址
4. 修改 `project.config.json` 中的 `appid`
5. 编译运行

### 3. 阿里云 OSS

- 创建 OSS Bucket，设置跨域规则允许小程序域名
- 配置生命周期规则，7天自动清理 uploads/ 目录

## AI 诊断流程

1. **图片上传**：客户端直传 OSS，获取临时 URL
2. **视觉特征提取**：通义千问-VL 分析图片，输出脸型/肤色/五官等特征
3. **报告生成**：特征数据 + 用户标签 → 通义千问4.0 → 结构化 JSON
4. **格式校验**：校验输出完整性，异常则重试1次，仍异常使用兜底数据
5. **报告展示**：9大板块分步展示，支持分享海报

## 报告 9 大板块

| 板块 | 内容 |
|------|------|
| 综合评分 | 加权评分(面部35%+肤色30%+风格20%+身形15%)、核心标签 |
| 脸型分析 | 脸型判定、适配发型、避雷发型、适配领型 |
| 肤色诊断 | 冷暖皮、四季色彩、本命色盘、避雷色盘、发色推荐 |
| 风格基因 | 主/副风格、量感直曲动静、场景穿搭方案 |
| 身形适配 | 肩型、比例、适配上/下装版型、避雷版型 |
| 穿搭推荐 | 10+适配单品、避雷单品 |
| 发型推荐 | TOP3发型、备选发型、发色方案、避雷发型 |
| 妆容指南 | 底妆/眉眼/唇妆建议、避雷妆容 |
| 总结建议 | 核心结论、改造优先级、日常小贴士 |

## 技术栈

- **前端**：微信小程序原生开发
- **后端**：Node.js + Express
- **AI**：通义千问-VL (qwen-vl-max) + 通义千问4.0 (qwen-max)
- **存储**：阿里云 OSS（图片，7天自动清理）

## License

MIT
