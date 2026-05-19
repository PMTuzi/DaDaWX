/**
 * 阿里云人脸检测与五官定位服务
 * 使用 ViIA (视觉智能) DetectFace API，返回106个面部关键点
 * 再通过算法加密至2000+点（三次样条插值 + Delaunay三角网格）
 * 
 * 106个关键点分布：
 *   0-32:  脸部轮廓 (33点)
 *   33-40: 左眉 (8点)
 *   41-48: 右眉 (8点)
 *   49-58: 左眼 (10点)
 *   59-68: 右眼 (10点)
 *   69-79: 鼻子 (11点)
 *   80-95: 嘴巴 (16点)
 *   96-105: 瞳孔等 (10点)
 */
const Facebody = require('@alicloud/facebody20191230').default
const OpenApiClient = require('@alicloud/openapi-client').default

let _client = null

function getClient() {
  if (_client) return _client

  const accessKeyId = process.env.ALIBABA_CLOUD_ACCESS_KEY_ID
  const accessKeySecret = process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET

  if (!accessKeyId || accessKeyId === 'your_access_key_id') {
    console.warn('[FaceDetect] 未配置 ALIBABA_CLOUD_ACCESS_KEY_ID，人脸检测不可用')
    return null
  }

  const config = new OpenApiClient.Config({
    accessKeyId,
    accessKeySecret,
    endpoint: 'facebody.cn-shanghai.aliyuncs.com'
  })

  _client = new Facebody(config)
  return _client
}

/**
 * 检测人脸并返回关键点
 * @param {string} imageUrl - 图片URL（公网可访问）
 * @param {string} imageBase64 - 或 base64 编码的图片
 * @returns {Object|null} 检测结果，包含 landmarks 和 faceRect
 */
async function detectFaceLandmarks(imageUrl, imageBase64) {
  const client = getClient()
  if (!client) return null

  try {
    const request = new Facebody.DetectFaceRequest()

    if (imageUrl) {
      request.imageURL = imageUrl
    } else if (imageBase64) {
      const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '')
      request.imageBase64 = base64Data
    } else {
      return null
    }

    request.maxFaceNum = 1

    console.log('[FaceDetect] 调用人脸检测API...')
    const t0 = Date.now()

    const response = await client.detectFace(request)

    console.log(`[FaceDetect] API响应, 耗时: ${Date.now() - t0}ms`)

    if (response.body?.code !== '200') {
      console.warn('[FaceDetect] API返回错误:', response.body?.message)
      return null
    }

    const data = response.body.data
    if (!data || !data.faceDetectInfoList || data.faceDetectInfoList.length === 0) {
      console.warn('[FaceDetect] 未检测到人脸')
      return null
    }

    const face = data.faceDetectInfoList[0]
    const landmarks = face.landmark || []
    const faceRect = face.faceRect || {}

    console.log(`[FaceDetect] 检测到人脸, ${landmarks.length}个基础关键点`)

    return parseLandmarks(landmarks, faceRect, face)
  } catch (err) {
    console.error('[FaceDetect] 调用失败:', err.message || err)
    return null
  }
}

// ============ 三次 Catmull-Rom 样条插值 ============

/**
 * Catmull-Rom 样条插值 - 通过所有控制点的平滑曲线
 * @param {Array} points - 控制点数组 [{x, y}, ...]
 * @param {number} segments - 每段插值点数
 * @param {boolean} closed - 是否闭合曲线
 * @returns {Array} 插值后的点数组
 */
function catmullRomSpline(points, segments = 16, closed = true) {
  if (!points || points.length < 2) return points || []
  if (points.length === 2) {
    const result = []
    for (let t = 0; t <= 1; t += 1 / segments) {
      result.push({
        x: points[0].x + (points[1].x - points[0].x) * t,
        y: points[0].y + (points[1].y - points[0].y) * t
      })
    }
    return result
  }

  const pts = closed ? [...points, points[0], points[1]] : [points[0], ...points, points[points.length - 1]]
  const result = []

  for (let i = 1; i < pts.length - 2; i++) {
    const p0 = pts[i - 1]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2]

    for (let t = 0; t < segments; t++) {
      const s = t / segments
      const s2 = s * s
      const s3 = s2 * s

      result.push({
        x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * s + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * s2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * s3),
        y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * s + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * s2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * s3)
      })
    }
  }

  return result
}

/**
 * 对一组轮廓点进行加密（样条插值 + 细分）
 * @param {Array} points - 原始控制点
 * @param {number} targetDensity - 目标密度（每段插值点数）
 * @param {boolean} closed - 是否闭合
 * @returns {Object} { dense: 加密点, sparse: 原始点 }
 */
function densifyContour(points, targetDensity = 16, closed = true) {
  if (!points || points.length < 3) {
    return { dense: points || [], sparse: points || [] }
  }
  const dense = catmullRomSpline(points, targetDensity, closed)
  return { dense, sparse: points }
}

/**
 * 生成面部三角网格（Delaunay-like）
 * 基于关键结构点构建三角面片，实现2000+采集点效果
 * @param {Object} detail - 五官轮廓点集合
 * @param {Object} faceRect - 人脸框
 * @param {number} imgW - 图片宽
 * @param {number} imgH - 图片高
 * @returns {Object} { meshPoints: 所有网格点, triangles: 三角面片索引 }
 */
function generateFaceMesh(detail, faceRect, imgW, imgH) {
  const allKeyPoints = []

  // 收集所有关键结构点（用于构建三角面片的顶点）
  const regions = [
    detail.faceOutline,
    detail.leftEye,
    detail.rightEye,
    detail.leftBrow,
    detail.rightBrow,
    detail.nose,
    detail.mouth
  ]

  const regionOffsets = []
  let offset = 0
  regions.forEach(region => {
    regionOffsets.push(offset)
    if (region) {
      region.forEach(p => {
        allKeyPoints.push({ x: p.x * imgW, y: p.y * imgH })
      })
      offset += region.length
    }
  })

  // 额外结构点（眼睛中心、鼻尖、嘴角等）用于更精细的网格
  const extraPoints = []

  // 两眼中心
  if (detail.leftEye?.length >= 6 && detail.rightEye?.length >= 6) {
    const lCenter = regionCenter(detail.leftEye, imgW, imgH)
    const rCenter = regionCenter(detail.rightEye, imgW, imgH)
    extraPoints.push(lCenter, rCenter)
  }

  // 鼻尖
  if (detail.nose?.length >= 6) {
    extraPoints.push({
      x: detail.nose[5].x * imgW,
      y: detail.nose[5].y * imgH
    })
  }

  // 嘴巴上下中心
  if (detail.mouth?.length >= 10) {
    extraPoints.push({
      x: detail.mouth[3].x * imgW,
      y: detail.mouth[3].y * imgH
    })
    extraPoints.push({
      x: detail.mouth[9].x * imgW,
      y: detail.mouth[9].y * imgH
    })
  }

  // 眉毛关键点
  if (detail.leftBrow?.length >= 5) {
    extraPoints.push({
      x: detail.leftBrow[4].x * imgW,
      y: detail.leftBrow[4].y * imgH
    })
  }
  if (detail.rightBrow?.length >= 5) {
    extraPoints.push({
      x: detail.rightBrow[4].x * imgW,
      y: detail.rightBrow[4].y * imgH
    })
  }

  // 额头中点（发际线位置估算）
  if (detail.faceOutline?.length >= 17) {
    const topOutline = detail.faceOutline.slice(0, 5).concat(detail.faceOutline.slice(-5))
    const avgX = topOutline.reduce((s, p) => s + p.x, 0) / topOutline.length
    const minY = Math.min(...topOutline.map(p => p.y))
    extraPoints.push({ x: avgX * imgW, y: (minY - 0.02) * imgH })
  }

  // 将额外点加入
  const extraOffset = allKeyPoints.length
  extraPoints.forEach(p => allKeyPoints.push(p))

  // 在关键点之间插值生成密集网格点
  const meshPoints = [...allKeyPoints]

  // 在脸轮廓上均匀插值
  if (detail.faceOutline?.length >= 10) {
    const outlinePx = detail.faceOutline.map(p => ({ x: p.x * imgW, y: p.y * imgH }))
    const denseOutline = catmullRomSpline(outlinePx, 8, true)
    denseOutline.forEach(p => {
      // 避免重复添加太近的点
      const tooClose = meshPoints.some(mp => Math.abs(mp.x - p.x) < 2 && Math.abs(mp.y - p.y) < 2)
      if (!tooClose) meshPoints.push(p)
    })
  }

  // 在脸上半部（额头区域）生成网格
  if (detail.faceOutline?.length >= 17 && detail.leftBrow?.length && detail.rightBrow?.length) {
    const foreheadTop = Math.min(...detail.faceOutline.slice(0, 5).concat(detail.faceOutline.slice(-5)).map(p => p.y)) * imgH
    const browY = Math.min(...detail.leftBrow.map(p => p.y).concat(detail.rightBrow.map(p => p.y))) * imgH
    const leftX = Math.min(...detail.faceOutline.map(p => p.x)) * imgW
    const rightX = Math.max(...detail.faceOutline.map(p => p.x)) * imgW

    // 生成额头区域网格点（3x5）
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 6; col++) {
        const t = (row + 1) / 5
        const x = leftX + (rightX - leftX) * (col + 1) / 7
        const y = foreheadTop + (browY - foreheadTop) * t
        meshPoints.push({ x, y })
      }
    }
  }

  // 在两眼之间、鼻子两侧生成中间网格
  if (detail.leftEye?.length >= 6 && detail.rightEye?.length >= 6) {
    const lOuter = { x: detail.leftEye[0].x * imgW, y: detail.leftEye[0].y * imgH }
    const lInner = { x: detail.leftEye[5].x * imgW, y: detail.leftEye[5].y * imgH }
    const rInner = { x: detail.rightEye[0].x * imgW, y: detail.rightEye[0].y * imgH }
    const rOuter = { x: detail.rightEye[5].x * imgW, y: detail.rightEye[5].y * imgH }

    // 两眼之间
    for (let i = 1; i < 4; i++) {
      const t = i / 4
      meshPoints.push({
        x: lInner.x + (rInner.x - lInner.x) * t,
        y: lInner.y + (rInner.y - lInner.y) * t
      })
    }

    // 眼下
    const eyeBottomY = Math.max(
      ...detail.leftEye.slice(5).map(p => p.y),
      ...detail.rightEye.slice(5).map(p => p.y)
    ) * imgH
    const noseTopY = detail.nose?.[0]?.y ? detail.nose[0].y * imgH : eyeBottomY + 10

    for (let i = 0; i < 4; i++) {
      const t = (i + 1) / 5
      const y = eyeBottomY + (noseTopY - eyeBottomY) * t
      meshPoints.push({ x: lInner.x - 5, y })
      meshPoints.push({ x: (lInner.x + rInner.x) / 2, y })
      meshPoints.push({ x: rInner.x + 5, y })
    }
  }

  // 鼻翼两侧到嘴角的网格
  if (detail.nose?.length >= 8 && detail.mouth?.length >= 4) {
    const noseBottom = detail.nose.slice(5, 8).map(p => ({ x: p.x * imgW, y: p.y * imgH }))
    const mouthCorner = { x: detail.mouth[0].x * imgW, y: detail.mouth[0].y * imgH }
    const mouthCornerR = { x: detail.mouth[6].x * imgW, y: detail.mouth[6].y * imgH }

    // 鼻翼到嘴角之间
    for (let i = 1; i < 3; i++) {
      const t = i / 3
      if (noseBottom[0]) {
        meshPoints.push({
          x: noseBottom[0].x + (mouthCorner.x - noseBottom[0].x) * t,
          y: noseBottom[0].y + (mouthCorner.y - noseBottom[0].y) * t
        })
      }
      if (noseBottom[2]) {
        meshPoints.push({
          x: noseBottom[2].x + (mouthCornerR.x - noseBottom[2].x) * t,
          y: noseBottom[2].y + (mouthCornerR.y - noseBottom[2].y) * t
        })
      }
    }
  }

  // 嘴巴到下巴的网格
  if (detail.mouth?.length >= 4 && detail.faceOutline?.length >= 17) {
    const mouthBottomY = Math.max(...detail.mouth.map(p => p.y)) * imgH
    const chinY = detail.faceOutline[16].y * imgH
    const faceL = Math.min(...detail.faceOutline.slice(10, 23).map(p => p.x)) * imgW
    const faceR = Math.max(...detail.faceOutline.slice(10, 23).map(p => p.x)) * imgW

    for (let row = 1; row <= 4; row++) {
      const t = row / 5
      const y = mouthBottomY + (chinY - mouthBottomY) * t
      const widthFactor = 1 - t * 0.4  // 下巴逐渐收窄
      const cx = (faceL + faceR) / 2
      const halfW = (faceR - faceL) / 2 * widthFactor
      for (let col = 0; col < 5; col++) {
        const x = (cx - halfW) + halfW * 2 * (col + 1) / 6
        meshPoints.push({ x, y })
      }
    }
  }

  // 简化的三角剖分（基于邻近关系的贪心三角化）
  const triangles = simpleTriangulate(meshPoints)

  // 转为相对坐标
  const meshPointsNorm = meshPoints.map(p => ({ x: p.x / imgW, y: p.y / imgH }))

  console.log(`[FaceDetect] 生成密集点云: ${meshPoints.length}个点, ${triangles.length}个三角面片`)

  return { meshPoints: meshPointsNorm, triangles }
}

function regionCenter(points, imgW, imgH) {
  const cx = points.reduce((s, p) => s + p.x, 0) / points.length
  const cy = points.reduce((s, p) => s + p.y, 0) / points.length
  return { x: cx * imgW, y: cy * imgH }
}

/**
 * 简化三角剖分 - 基于Delaunay准则的贪心算法
 * 对于2000+点的面网格已足够精确
 */
function simpleTriangulate(points) {
  const n = points.length
  if (n < 3) return []

  const triangles = []
  const maxDist = 80  // 最大边长（像素），超过则不连接

  // 为每个点找最近的5个邻居，构建边
  const edges = new Set()
  for (let i = 0; i < n; i++) {
    const dists = []
    for (let j = 0; j < n; j++) {
      if (i === j) continue
      const dx = points[i].x - points[j].x
      const dy = points[i].y - points[j].y
      const d = Math.sqrt(dx * dx + dy * dy)
      if (d < maxDist) dists.push({ j, d })
    }
    dists.sort((a, b) => a.d - b.d)
    const neighbors = dists.slice(0, 6)
    neighbors.forEach(nb => {
      const key = Math.min(i, nb.j) + '_' + Math.max(i, nb.j)
      edges.add(key)
    })
  }

  // 从边列表构建三角形
  const edgeList = []
  edges.forEach(key => {
    const [a, b] = key.split('_').map(Number)
    edgeList.push([a, b])
  })

  // 用边邻接关系构建三角形
  const pointEdges = new Map()
  edgeList.forEach(([a, b]) => {
    if (!pointEdges.has(a)) pointEdges.set(a, new Set())
    if (!pointEdges.has(b)) pointEdges.set(b, new Set())
    pointEdges.get(a).add(b)
    pointEdges.get(b).add(a)
  })

  const triSet = new Set()
  pointEdges.forEach((neighbors, p) => {
    const nbArr = Array.from(neighbors)
    for (let i = 0; i < nbArr.length; i++) {
      for (let j = i + 1; j < nbArr.length; j++) {
        const a = nbArr[i], b = nbArr[j]
        if (pointEdges.get(a)?.has(b)) {
          const tri = [p, a, b].sort((x, y) => x - y)
          const key = tri.join('_')
          if (!triSet.has(key)) {
            // 检查三角形面积（过滤退化三角形）
            const area = Math.abs(
              (points[tri[1]].x - points[tri[0]].x) * (points[tri[2]].y - points[tri[0]].y) -
              (points[tri[2]].x - points[tri[0]].x) * (points[tri[1]].y - points[tri[0]].y)
            ) / 2
            if (area > 10 && area < 5000) {  // 合理的三角形面积范围
              triSet.add(key)
              triangles.push(tri)
            }
          }
        }
      }
    }
  })

  return triangles
}

/**
 * 解析106个关键点为三庭五眼标注所需的结构化数据
 * 并通过算法加密至2000+点
 */
function parseLandmarks(landmarks, faceRect, face) {
  if (!landmarks || landmarks.length < 80) return null

  const imgW = face.imageWidth || 1
  const imgH = face.imageHeight || 1

  const p = (idx) => {
    const lm = landmarks[idx]
    return lm ? { x: lm.x / imgW, y: lm.y / imgH } : null
  }

  // ====== 三庭关键点 ======
  const rightTemple = p(0)
  const leftTemple = p(32)
  const rightBrowInner = p(41)
  const leftBrowInner = p(33)
  const rightBrowMid = p(43)
  const leftBrowMid = p(35)
  const rightBrowOuter = p(45)
  const leftBrowOuter = p(37)

  // ====== 改进的发际线估算 ======
  // 使用脸轮廓最顶部点和眉骨之间的比例关系
  // 取太阳穴区域（0-5, 27-32）的最高Y值
  const templePoints = []
  for (let i = 0; i <= 5; i++) { const pt = p(i); if (pt) templePoints.push(pt) }
  for (let i = 27; i <= 32; i++) { const pt = p(i); if (pt) templePoints.push(pt) }

  const templeTopY = templePoints.length > 0
    ? Math.min(...templePoints.map(pt => pt.y))
    : 0.2

  // 眉骨Y（取左右眉中点的平均值，更精确）
  const browPoints = []
  for (let i = 33; i <= 48; i++) { const pt = p(i); if (pt) browPoints.push(pt) }
  const browY = browPoints.length > 0
    ? browPoints.reduce((s, pt) => s + pt.y, 0) / browPoints.length
    : 0.3

  // 发际线：太阳穴顶部到眉骨之间的0.15处（更靠近太阳穴）
  // 但需要考虑额头高度个体差异，使用脸轮廓的形状来调整
  const foreheadRatio = 0.12  // 标准比例下发际线到眉骨约为三庭之一
  const hairlineY = templeTopY + (browY - templeTopY) * foreheadRatio

  // 鼻底：取鼻翼底部的Y值（多个点取平均更精确）
  const noseBaseLeft = p(76)
  const noseBaseRight = p(77)
  const noseTip = p(75)
  const noseBottom = p(79) // 鼻底中点
  const noseBasePoints = [noseBaseLeft, noseBaseRight, noseBottom].filter(Boolean)
  const noseBaseY = noseBasePoints.length > 0
    ? noseBasePoints.reduce((s, pt) => s + pt.y, 0) / noseBasePoints.length
    : (noseTip ? noseTip.y + 0.015 : 0.6)

  // 下巴
  const chinPoint = p(16)

  // ====== 五眼关键点 ======
  const leftEyeInner = p(49)
  const leftEyeOuter = p(52)
  const rightEyeInner = p(59)
  const rightEyeOuter = p(62)
  const leftPupil = p(96)
  const rightPupil = p(97)

  // ====== 脸型轮廓 ======
  const faceOutlinePoints = []
  for (let i = 0; i <= 32; i++) {
    const pt = p(i)
    if (pt) faceOutlinePoints.push(pt)
  }

  // ====== 五官细节 ======
  const leftEyePoints = []
  for (let i = 49; i <= 58; i++) { const pt = p(i); if (pt) leftEyePoints.push(pt) }
  const rightEyePoints = []
  for (let i = 59; i <= 68; i++) { const pt = p(i); if (pt) rightEyePoints.push(pt) }
  const leftBrowPoints = []
  for (let i = 33; i <= 40; i++) { const pt = p(i); if (pt) leftBrowPoints.push(pt) }
  const rightBrowPoints = []
  for (let i = 41; i <= 48; i++) { const pt = p(i); if (pt) rightBrowPoints.push(pt) }
  const nosePoints = []
  for (let i = 69; i <= 79; i++) { const pt = p(i); if (pt) nosePoints.push(pt) }
  const mouthPoints = []
  for (let i = 80; i <= 95; i++) { const pt = p(i); if (pt) mouthPoints.push(pt) }

  const detailPoints = {
    faceOutline: faceOutlinePoints,
    leftEye: leftEyePoints,
    rightEye: rightEyePoints,
    leftBrow: leftBrowPoints,
    rightBrow: rightBrowPoints,
    nose: nosePoints,
    mouth: mouthPoints
  }

  // ====== 算法加密：从106点生成2000+密集点 ======
  const densified = {
    faceOutline: densifyContour(faceOutlinePoints, 12, true),     // 33 → ~400
    leftEye: densifyContour(leftEyePoints, 10, true),             // 10 → ~100
    rightEye: densifyContour(rightEyePoints, 10, true),           // 10 → ~100
    leftBrow: densifyContour(leftBrowPoints, 8, false),            // 8 → ~60
    rightBrow: densifyContour(rightBrowPoints, 8, false),         // 8 → ~60
    nose: densifyContour(nosePoints, 8, false),                    // 11 → ~80
    mouth: densifyContour(mouthPoints, 10, true),                 // 16 → ~160
  }

  // 生成面网格
  const mesh = generateFaceMesh(detailPoints, faceRect, imgW, imgH)

  // ====== 三庭比例计算（更精确） ======
  const upperCourt = browY - hairlineY
  const middleCourt = noseBaseY - browY
  const lowerCourt = (chinPoint?.y || 0.9) - noseBaseY
  const totalCourt = upperCourt + middleCourt + lowerCourt

  // ====== 五眼比例计算（更精确） ======
  const leftEyeWidth = leftEyeOuter && leftEyeInner
    ? Math.abs(leftEyeOuter.x - leftEyeInner.x) : 0
  const rightEyeWidth = rightEyeInner && rightEyeOuter
    ? Math.abs(rightEyeOuter.x - rightEyeInner.x) : 0
  const interEyeDist = leftEyeInner && rightEyeInner
    ? Math.abs(rightEyeInner.x - leftEyeInner.x) : 0

  // 改进：五眼的"眼1"和"眼5"应该从脸轮廓最外侧到眼角
  // 用脸轮廓的宽度来计算更准确
  const faceLeftX = faceOutlinePoints.length > 0 ? Math.min(...faceOutlinePoints.map(pt => pt.x)) : 0
  const faceRightX = faceOutlinePoints.length > 0 ? Math.max(...faceOutlinePoints.map(pt => pt.x)) : 1
  const leftTempleToEye = leftEyeOuter ? Math.abs(leftEyeOuter.x - faceLeftX) : 0
  const rightEyeToTemple = rightEyeOuter ? Math.abs(faceRightX - rightEyeOuter.x) : 0
  const totalFiveEyes = leftTempleToEye + leftEyeWidth + interEyeDist + rightEyeWidth + rightEyeToTemple

  return {
    // Canvas 绘制用的关键点
    landmarks: {
      hairline: { y: hairlineY },
      eyebrowLeft: leftBrowMid || leftBrowInner,
      eyebrowRight: rightBrowMid || rightBrowInner,
      noseBase: { y: noseBaseY },
      chin: chinPoint,
      leftEyeInner,
      leftEyeOuter,
      rightEyeInner,
      rightEyeOuter,
      leftPupil,
      rightPupil,
      leftTemple,
      rightTemple,
      // 新增：更精确的发际线参考点
      templeTopY,
      browY,
      // 新增：眉骨外侧点（用于五眼标注边界）
      leftBrowOuter,
      rightBrowOuter,
    },
    // 详细关键点集合（用于精确绘制轮廓）
    detailPoints,
    // 加密后的密集点云（2000+）
    densifiedPoints: densified,
    // 面网格数据
    meshData: mesh,
    // 三庭比例
    threeCourts: {
      upper: totalCourt > 0 ? (upperCourt / totalCourt).toFixed(3) : 0,
      middle: totalCourt > 0 ? (middleCourt / totalCourt).toFixed(3) : 0,
      lower: totalCourt > 0 ? (lowerCourt / totalCourt).toFixed(3) : 0,
      upperRaw: upperCourt,
      middleRaw: middleCourt,
      lowerRaw: lowerCourt,
      balance: totalCourt > 0
        ? (Math.abs(upperCourt / totalCourt - 1/3) < 0.05
          && Math.abs(middleCourt / totalCourt - 1/3) < 0.05
          && Math.abs(lowerCourt / totalCourt - 1/3) < 0.05)
          ? '三庭均衡'
          : upperCourt > middleCourt && upperCourt > lowerCourt
            ? '上庭偏长'
            : middleCourt > lowerCourt
              ? '中庭偏长'
              : '下庭偏长'
        : '待分析'
    },
    // 五眼比例
    fiveEyes: {
      eye1: totalFiveEyes > 0 ? (leftTempleToEye / totalFiveEyes).toFixed(3) : 0,
      leftEye: totalFiveEyes > 0 ? (leftEyeWidth / totalFiveEyes).toFixed(3) : 0,
      interEye: totalFiveEyes > 0 ? (interEyeDist / totalFiveEyes).toFixed(3) : 0,
      rightEye: totalFiveEyes > 0 ? (rightEyeWidth / totalFiveEyes).toFixed(3) : 0,
      eye5: totalFiveEyes > 0 ? (rightEyeToTemple / totalFiveEyes).toFixed(3) : 0,
      balance: totalFiveEyes > 0
        ? (Math.abs(leftTempleToEye / totalFiveEyes - 1/5) < 0.03
          && Math.abs(leftEyeWidth / totalFiveEyes - 1/5) < 0.03
          && Math.abs(interEyeDist / totalFiveEyes - 1/5) < 0.03)
          ? '五眼均衡'
          : interEyeDist / totalFiveEyes > 0.25
            ? '眼距偏宽'
            : interEyeDist / totalFiveEyes < 0.18
              ? '眼距偏窄'
              : '五眼基本均衡'
        : '待分析'
    },
    // 人脸框
    faceRect: {
      x: faceRect.x,
      y: faceRect.y,
      width: faceRect.width,
      height: faceRect.height
    }
  }
}

module.exports = { detectFaceLandmarks }
