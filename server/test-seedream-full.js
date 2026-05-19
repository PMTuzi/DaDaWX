/**
 * 测试：把全部分析结果当 prompt 输入 Seedream 生成图片
 */
require('dotenv').config()
const axios = require('axios')
const fs = require('fs')
const path = require('path')

const VOLCENGINE_API_KEY = process.env.VOLCENGINE_API_KEY
const SEEDREAM_MODEL = process.env.VOLCENGINE_SEEDREAM_MODEL || 'doubao-seedream-5-0-260128'

// 模拟一份完整的报告数据
const sampleReport = {
  basic: {
    overallScore: 7.8,
    tags: ['菱形脸', '冷夏型', '优雅型', '中量感'],
    advantages: '颧骨线条精致，面部立体感强',
    weaknesses: '下庭略短，需用发型修饰'
  },
  bone: {
    faceType: '菱形脸',
    faceScore: 7.5,
    boneType: '骨相型',
    boneDesc: '颧骨较为突出，下颌线条清晰，面部骨骼感强，属于典型的骨相美人',
    threeCourts: {
      upper: '上庭比例适中，发际线弧度优美',
      middle: '中庭偏长，鼻梁挺直增加面部立体感',
      lower: '下庭略短，下巴精致但略显局促',
      balance: '中长'
    },
    fiveEyes: {
      analysis: '五眼比例中两眼间距偏窄，眼宽适中',
      suggestion: '建议用眼妆拉长眼尾，增加眼距视觉效果'
    },
    faceFeatures: [
      { name: '颧骨', desc: '颧骨较宽突出，面部最宽点在颧骨处', score: 8.5 },
      { name: '下颌线', desc: '下颌线条清晰，收窄明显', score: 8 },
      { name: '眉骨', desc: '眉骨立体，眉眼深邃', score: 7.5 },
      { name: '鼻梁', desc: '鼻梁挺直，鼻翼窄', score: 8 },
      { name: '下巴', desc: '下巴尖削，V字轮廓', score: 7 }
    ],
    suitableHaircuts: [
      { name: '法式慵懒卷', length: '中', bangs: '侧分长刘海', reason: '卷发修饰颧骨，侧分刘海柔化棱角', score: 9 },
      { name: '锁骨发', length: '中', bangs: '空气刘海', reason: '长度遮住颧骨最宽处，空气刘海减龄', score: 8.5 },
      { name: '低马尾', length: '长', bangs: '无刘海', reason: '露出下颌线条优势', score: 8 }
    ],
    avoidHaircuts: [
      { name: '贴头皮中分直发', reason: '暴露颧骨宽度，显得面部更窄' },
      { name: '齐耳短发', reason: '截断点恰在颧骨处，强调最宽点' }
    ],
    keyInsight: '颧骨突出是最大特征，应用发型修饰颧骨宽度，突出下颌线条优势'
  },
  skin: {
    skinType: '冷皮',
    brightness: 7.5,
    purity: 7,
    season: '冷夏型',
    seasonDetail: '肤色偏冷调，适合柔和的冷色系，避免浓烈暖色',
    problems: [
      { name: '黑眼圈', level: '轻微', area: '眼下', advice: '用橘色遮瑕中和' },
      { name: 'T区泛油', level: '中等', area: '额头鼻翼', advice: '分区控油' }
    ],
    goodColors: [
      { name: '雾霾蓝', hex: '#7B9EB8', usage: '上衣/外套' },
      { name: '烟粉', hex: '#D4A5B5', usage: '唇色/腮红' },
      { name: '薄荷绿', hex: '#98C9B4', usage: '配饰点缀' },
      { name: '薰衣草紫', hex: '#B8A9C9', usage: '连衣裙' },
      { name: '灰粉', hex: '#C9A9AD', usage: '针织衫' },
      { name: '冰蓝', hex: '#A5C8E1', usage: '衬衫' },
      { name: '柔白', hex: '#F0EDE8', usage: '内搭基础色' },
      { name: '银灰', hex: '#B8B8B8', usage: '裤装/半裙' }
    ],
    badColors: [
      { name: '正红', hex: '#FF0000', reason: '过于浓烈，与冷皮冲突' },
      { name: '亮橙', hex: '#FF8C00', reason: '暖色调让肤色显黄' },
      { name: '土黄', hex: '#CCB36B', reason: '拉低肤色明度' },
      { name: '深棕', hex: '#654321', reason: '显得肤色暗沉' }
    ],
    keyInsight: '冷夏型肤色最适合灰调柔和色系，烟粉和雾霾蓝是你的本命色'
  },
  colorStyle: {
    mainStyle: '优雅型',
    mainScore: 8.5,
    styleDesc: '气质温柔知性，五官精致有辨识度，整体给人优雅从容的感觉',
    subStyles: [
      { name: '浪漫型', score: 7, desc: '有女性化柔美特质' },
      { name: '古典型', score: 6.5, desc: '气质端庄' }
    ],
    styleFeatures: {
      mass: '中量感，五官精致不厚重',
      curve: '偏曲，面部轮廓有柔和弧度',
      movement: '偏静，气质沉稳内敛'
    },
    clothingAdvice: {
      silhouette: 'X型/收腰版型，突出腰线',
      material: '丝绸/雪纺/羊绒等柔软垂坠材质',
      pattern: '小碎花/波点/细条纹等精致图案',
      accessory: '珍珠/细链/小巧耳饰'
    },
    sceneAdvice: [
      { scene: '职场', desc: '烟粉西装+灰粉内搭+银灰阔腿裤', keyItems: '西装、阔腿裤' },
      { scene: '日常', desc: '雾霾蓝针织+柔白半裙+珍珠耳饰', keyItems: '针织衫、半裙' },
      { scene: '约会', desc: '薰衣草紫连衣裙+细带凉鞋', keyItems: '连衣裙' },
      { scene: '休闲', desc: '冰蓝衬衫+白色直筒裤+帆布鞋', keyItems: '衬衫、直筒裤' }
    ],
    keyInsight: '优雅型是核心风格，所有穿搭围绕"精致+柔美"展开'
  },
  outfit: {
    hairRecommend: {
      top3: [
        { name: '法式慵懒卷', layers: '层次感大卷', bangs: '侧分八字刘海', care: '用弹力素保持卷度', reason: '卷发弧度柔化颧骨，八字刘海修饰脸型', score: 9 },
        { name: '锁骨直发', layers: '发尾微C卷', bangs: '空气刘海', care: '定期修层次', reason: '长度遮颧骨，空气刘海减龄', score: 8.5 },
        { name: '低盘发', layers: '蓬松感', bangs: '碎发刘海', care: '用定型喷雾', reason: '露出下颌线优势，碎发柔和脸型', score: 8 }
      ],
      avoidHair: [
        { name: '贴头皮中分', reason: '暴露颧骨宽度' },
        { name: '齐耳短发', reason: '截断在颧骨处显脸宽' },
        { name: '大背头', reason: '全露脸型缺陷' }
      ]
    },
    makeup: {
      style: '清透氧气妆',
      foundation: { tone: '粉调一白', shade: '冷调象牙白', concealer: '橘色遮黑眼圈' },
      eyeBrow: { shape: '弯月眉', shadow: '灰棕色眼影', eyeliner: '棕色内眼线拉长眼尾' },
      lipRecommend: { destiny: '烟粉玫瑰色#D4A5B5', daily: '蜜桃奶茶色#D4A09A' },
      avoidMakeup: ['浓烟熏妆', '正红唇']
    },
    bodyShape: {
      shoulderType: '窄肩',
      bodyRatio: '上身短下身长',
      suitableTop: [
        { type: '泡泡袖/垫肩上衣', reason: '拓宽肩线平衡比例', score: 8.5 },
        { type: 'V领针织', reason: '拉长颈部线条', score: 8 }
      ],
      suitableBottom: [
        { type: '高腰A字裙', reason: '提高腰线优化比例', score: 9 },
        { type: '直筒阔腿裤', reason: '延伸腿部线条', score: 8.5 }
      ],
      tips: ['上衣选浅色/下装选深色', '腰带提高腰线', '鞋子选尖头延伸脚背']
    },
    summary: {
      coreConclusion: '优雅型骨相美人，核心风格"精致柔美"，菱形脸用发型修饰颧骨是关键',
      priorityAdvice: '1.发型改造(法式卷)→2.色彩调整(冷夏色系)→3.妆容优化(氧气妆)',
      dailyTips: ['每天用弹力素维持卷度', '穿搭保持X型收腰', '口红选烟粉/蜜桃色系']
    },
    keyInsight: '发型修饰颧骨是最大改造杠杆，优先做发型变化'
  }
}

// 生成包含全部数据的超长 prompt
function buildFullPrompt(report) {
  const { basic, bone, skin, colorStyle, outfit } = report

  return `高端时尚杂志诊断报告海报，竖版构图，深色高级背景。

顶部区域：大标题"AI形象诊断"用金色衬线字体，综合评分"${basic.overallScore}分"用超大数字，4个标签"${basic.tags.join(' · ')}"横排。

第二区域"骨相分析"：脸型"${bone.faceType}"大字，骨相类型"${bone.boneType}"，骨相描述"${bone.boneDesc}"，三庭比例：上庭${bone.threeCourts.upper}，中庭${bone.threeCourts.middle}，下庭${bone.threeCourts.lower}，5个面部特征评分条：颧骨${bone.faceFeatures[0].score}分，下颌线${bone.faceFeatures[1].score}分，眉骨${bone.faceFeatures[2].score}分，鼻梁${bone.faceFeatures[3].score}分，下巴${bone.faceFeatures[4].score}分，3个推荐发型：${bone.suitableHaircuts.map(h => h.name).join('、')}，核心洞察：${bone.keyInsight}。

第三区域"皮肤状态"：肤色类型"${skin.skinType}"，明度${skin.brightness}纯度${skin.purity}，四季色彩"${skin.season}"，8个适配色块整齐2行4列排列：${skin.goodColors.map(c => `${c.name}(${c.hex})`).join('、')}，4个避雷色块：${skin.badColors.map(c => `${c.name}(${c.hex})`).join('、')}，核心洞察：${skin.keyInsight}。

第四区域"色彩风格"：主风格"${colorStyle.mainStyle}"${colorStyle.mainScore}分，风格描述"${colorStyle.styleDesc}"，量感${colorStyle.styleFeatures.mass}，曲直${colorStyle.styleFeatures.curve}，动静${colorStyle.styleFeatures.movement}，穿搭建议：版型${colorStyle.clothingAdvice.silhouette}，材质${colorStyle.clothingAdvice.material}，4个场景：职场${colorStyle.sceneAdvice[0].desc}，日常${colorStyle.sceneAdvice[1].desc}，约会${colorStyle.sceneAdvice[2].desc}，休闲${colorStyle.sceneAdvice[3].desc}。

第五区域"穿搭风格"：TOP3发型${outfit.hairRecommend.top3.map(h => h.name).join('、')}，避雷发型${outfit.hairRecommend.avoidHair.map(h => h.name).join('、')}，妆容风格"${outfit.makeup.style}"，本命口红${outfit.makeup.lipRecommend.destiny}，身形${outfit.bodyShape.shoulderType}/${outfit.bodyShape.bodyRatio}，核心结论${outfit.summary.coreConclusion}。

底部：品牌水印"搭搭DA·DA"，金色极细线条分隔每个区域，整体高级时尚杂志风格。`
}

async function testSeedream() {
  const prompt = buildFullPrompt(sampleReport)
  console.log('=== Prompt 长度:', prompt.length, '字 ===')
  console.log('=== Prompt 内容 ===')
  console.log(prompt)
  console.log('\n=== 开始调用 Seedream ===')

  const t0 = Date.now()
  try {
    const response = await axios.post(
      'https://ark.cn-beijing.volces.com/api/v3/images/generations',
      {
        model: SEEDREAM_MODEL,
        prompt,
        size: '2K',
        response_format: 'url',
        sequential_image_generation: 'disabled',
        stream: false,
        watermark: true
      },
      {
        headers: {
          'Authorization': `Bearer ${VOLCENGINE_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 180000
      }
    )

    const imageUrl = response.data?.data?.[0]?.url
    console.log(`\n=== 生成成功! 耗时: ${Date.now() - t0}ms ===`)
    console.log('图片URL:', imageUrl)

    // 下载图片保存到本地
    if (imageUrl) {
      const imgRes = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 30000 })
      const savePath = path.join(__dirname, 'test-seedream-full.jpg')
      fs.writeFileSync(savePath, imgRes.data)
      console.log('图片已保存到:', savePath)
    }
  } catch (err) {
    console.error('=== 生成失败 ===')
    console.error('错误:', err.response?.data || err.message)
  }
}

testSeedream()
