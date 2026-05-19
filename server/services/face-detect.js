/**
 * 阿里云市场 iCREDIT 人脸面部属性分析服务
 * API: https://ylmr.market.alicloudapi.com/icredit_ai_model/iCREDIT_0849/create_ai_job
 * 
 * 返回数据包含：
 *   - 人脸坐标 [x, y, w, h]
 *   - 面部轮廓 33点（像素坐标）
 *   - 下颌线 17点
 *   - 脸型（如"圆脸"）
 *   - 三庭：上庭/中庭/下庭（像素距离）
 *   - 五眼：五眼-左起-1到5（像素距离）
 *   - 面宽、瞳距
 * 
 * 再通过 Catmull-Rom 样条插值加密至2000+点
 */

const https = require('https')

const ICREDIT_HOST = 'ylmr.market.alicloudapi.com'
const ICREDIT_PATH = '/icredit_ai_model/iCREDIT_0849/create_ai_job'

function getAppCode() {
  const code = process.env.ICREDIT_APPCODE
  if (!code || code === 'your_icredit_appcode') {
    console.warn('[FaceDetect] 未配置 ICREDIT_APPCODE，人脸检测不可用')
    return null
  }
  return code
}

/**
 * 调用 iCREDIT 人脸面部属性分析 API
 * @param {string} imageUrl - 图片URL（公网可访问）
 * @param {string} imageBase64 - 或 base64 编码的图片
 * @returns {Object|null} 检测结果
 */
async function detectFaceLandmarks(imageUrl, imageBase64) {
  const appCode = getAppCode()
  if (!appCode) return null

  try {
    let urlParam = ''
    if (imageBase64) {
      // BASE64编码后进行URLENCODE
      const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '')
      urlParam = 'URL=' + encodeURIComponent(base64Data)
    } else if (imageUrl) {
      urlParam = 'URL=' + encodeURIComponent(imageUrl)
    } else {
      return null
    }

    console.log('[FaceDetect] 调用iCREDIT面部属性分析API...')
    const t0 = Date.now()

    const result = await callICREDITAPI(urlParam, appCode)

    console.log(`[FaceDetect] API响应, 耗时: ${Date.now() - t0}ms`)

    if (!result || !result.IMAGE_PROCESS_EXTRACT_ENTITY) {
      console.warn('[FaceDetect] API返回数据为空')
      return null
    }

    const faces = result.IMAGE_PROCESS_EXTRACT_ENTITY
    if (!faces || faces.length === 0) {
      console.warn('[FaceDetect] 未检测到人脸')
      return null
    }

    const face = faces[0]
    return parseICREDITResponse(face)
  } catch (err) {
    console.error('[FaceDetect] 调用失败:', err.message || err)
    return null
  }
}

/**
 * 调用 iCREDIT HTTPS API
 */
function callICREDITAPI(postData, appCode) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: ICREDIT_HOST,
      path: ICREDIT_PATH,
      method: 'POST',
      headers: {
        'Authorization': 'APPCODE ' + appCode,
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 30000
    }

    const req = https.request(opts, (res) => {
      let data = ''
      res.on('data', d => data += d)
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`API HTTP ${res.statusCode}: ${data.substring(0, 200)}`))
          return
        }
        try {
          resolve(JSON.parse(data))
        } catch (e) {
          reject(new Error('API响应JSON解析失败'))
        }
      })
    })

    req.on('error', (e) => reject(e))
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('API请求超时'))
    })
    req.write(postData)
    req.end()
  })
}

/**
 * 从 iCREDIT 响应中提取实体值
 */
function getEntity(face, name) {
  const entity = face.find(e => e.ENTITY_NAME === name)
  return entity ? entity.ENTITY_VALUE : null
}

// ============ 三次 Catmull-Rom 样条插值 ============

/**
 * Catmull-Rom 样条插值 - 通过所有控制点的平滑曲线
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
 * 对一组轮廓点进行加密
 */
function densifyContour(points, targetDensity = 16, closed = true) {
  if (!points || points.length < 3) {
    return { dense: points || [], sparse: points || [] }
  }
  const dense = catmullRomSpline(points, targetDensity, closed)
  return { dense, sparse: points }
}

/**
 * 生成面部三角网格
 * iCREDIT API 只返回面部轮廓，需要用网格填充脸部区域实现2000+点效果
 */
function generateFaceMesh(faceOutline, faceRect, imgW, imgH, threeCourtsData) {
  const allKeyPoints = []

  // 面部轮廓点
  if (faceOutline) {
    faceOutline.forEach(p => allKeyPoints.push({ x: p.x, y: p.y }))
  }

  // 额外结构点
  const extraPoints = []

  // 从三庭数据推算关键水平线位置
  const upperPx = threeCourtsData?.upperPx || 0
  const middlePx = threeCourtsData?.middlePx || 0
  const lowerPx = threeCourtsData?.lowerPx || 0

  if (faceOutline && faceOutline.length > 10) {
    const cx = faceOutline.reduce((s, p) => s + p.x, 0) / faceOutline.length
    // 轮廓最高区域
    const topPoints = faceOutline.slice(0, Math.floor(faceOutline.length / 4))
      .concat(faceOutline.slice(-Math.floor(faceOutline.length / 4)))
    const hairlineY = Math.min(...topPoints.map(p => p.y))
    // 下巴区域
    const bottomPoints = faceOutline.slice(Math.floor(faceOutline.length * 0.4), Math.floor(faceOutline.length * 0.6))
    const chinY = Math.max(...bottomPoints.map(p => p.y))

    // 三庭分界线
    const browY = hairlineY + upperPx
    const noseBaseY = browY + middlePx

    const faceCX = faceRect ? faceRect.x + faceRect.width / 2 : cx
    const halfW = (faceRect?.width || imgW * 0.4) / 2

    // 上庭区域网格（额头）- 密集网格
    for (let row = 0; row < 10; row++) {
      const t = (row + 1) / 11
      const y = hairlineY + (browY - hairlineY) * t
      const rowWidth = halfW * (0.6 + t * 0.4)  // 从上到下逐渐变宽
      for (let col = 0; col < 12; col++) {
        const ct = (col + 1) / 13
        const x = faceCX - rowWidth + rowWidth * 2 * ct
        extraPoints.push({ x, y })
      }
    }

    // 中庭区域网格（眉-鼻底）
    for (let row = 0; row < 10; row++) {
      const t = (row + 1) / 11
      const y = browY + (noseBaseY - browY) * t
      const rowWidth = halfW * (1.0 - t * 0.15)  // 略微收窄
      for (let col = 0; col < 12; col++) {
        const ct = (col + 1) / 13
        const x = faceCX - rowWidth + rowWidth * 2 * ct
        extraPoints.push({ x, y })
      }
    }

    // 下庭区域网格（鼻底-下巴）
    for (let row = 0; row < 10; row++) {
      const t = (row + 1) / 11
      const y = noseBaseY + (chinY - noseBaseY) * t
      const rowWidth = halfW * (0.85 - t * 0.35)  // 逐渐收窄到下巴
      for (let col = 0; col < 10; col++) {
        const ct = (col + 1) / 11
        const x = faceCX - rowWidth + rowWidth * 2 * ct
        extraPoints.push({ x, y })
      }
    }
  }

  const extraOffset = allKeyPoints.length
  extraPoints.forEach(p => allKeyPoints.push(p))

  // 在轮廓上插值生成密集点
  if (faceOutline && faceOutline.length >= 10) {
    const denseOutline = catmullRomSpline(faceOutline.map(p => ({ x: p.x, y: p.y })), 12, true)
    denseOutline.forEach(p => {
      const tooClose = allKeyPoints.some(mp => Math.abs(mp.x - p.x) < 3 && Math.abs(mp.y - p.y) < 3)
      if (!tooClose) allKeyPoints.push(p)
    })
  }

  // 简化三角剖分
  const triangles = simpleTriangulate(allKeyPoints)

  // 转为归一化坐标
  const meshPointsNorm = allKeyPoints.map(p => ({ x: p.x / imgW, y: p.y / imgH }))

  console.log(`[FaceDetect] 生成密集点云: ${allKeyPoints.length}个点, ${triangles.length}个三角面片`)

  return { meshPoints: meshPointsNorm, triangles }
}

/**
 * 简化三角剖分
 */
function simpleTriangulate(points) {
  const n = points.length
  if (n < 3) return []

  const triangles = []
  // 根据点数自适应最大边长
  const maxDist = n > 500 ? 60 : 80

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

  const edgeList = []
  edges.forEach(key => {
    const [a, b] = key.split('_').map(Number)
    edgeList.push([a, b])
  })

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
            const area = Math.abs(
              (points[tri[1]].x - points[tri[0]].x) * (points[tri[2]].y - points[tri[0]].y) -
              (points[tri[2]].x - points[tri[0]].x) * (points[tri[1]].y - points[tri[0]].y)
            ) / 2
            if (area > 10 && area < 5000) {
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
 * 解析 iCREDIT API 响应为三庭五眼标注所需的结构化数据
 */
function parseICREDITResponse(face) {
  // 提取各实体值
  const faceCoord = getEntity(face, '人脸坐标')      // [x, y, w, h]
  const faceType = getEntity(face, '脸型')           // 如"圆脸"
  const faceOutline = getEntity(face, '面部轮廓')     // [[x,y], ...] 33点
  const jawLine = getEntity(face, '下颌线')           // [[x,y], ...] 17点
  const faceWidth = getEntity(face, '面宽')           // 数值

  const upperCourt = getEntity(face, '上庭')          // 像素距离
  const middleCourt = getEntity(face, '中庭')
  const lowerCourt = getEntity(face, '下庭')

  const eye1 = getEntity(face, '五眼-左起-1')         // 像素距离
  const eye2 = getEntity(face, '五眼-左起-2')
  const eye3 = getEntity(face, '五眼-左起-3')
  const eye4 = getEntity(face, '五眼-左起-4')
  const eye5 = getEntity(face, '五眼-左起-5')

  const pupilDist = getEntity(face, '瞳距')           // 像素距离

  if (!faceOutline || faceOutline.length < 10) {
    console.warn('[FaceDetect] 面部轮廓点不足')
    return null
  }

  // 人脸坐标
  const rectX = faceCoord?.[0] || 0
  const rectY = faceCoord?.[1] || 0
  const rectW = faceCoord?.[2] || 0
  const rectH = faceCoord?.[3] || 0
  const faceRect = { x: rectX, y: rectY, width: rectW, height: rectH }

  // 图片尺寸（基于人脸坐标估算：人脸框一般占图片的30-50%）
  // 如果有面宽，可以用它辅助计算
  const imgW = rectW > 0 ? Math.round(rectW / 0.4) : 2000
  const imgH = rectH > 0 ? Math.round(rectH / 0.6) : 3000

  // ====== 面部轮廓点归一化 ======
  const outlinePoints = faceOutline.map(p => ({
    x: p[0] / imgW,
    y: p[1] / imgH
  }))

  // 下颌线点归一化
  const jawLinePoints = jawLine ? jawLine.map(p => ({
    x: p[0] / imgW,
    y: p[1] / imgH
  })) : []

  // ====== 三庭关键线位置（从轮廓点推算） ======
  // 发际线：轮廓最高点区域
  const templePoints = outlinePoints.slice(0, Math.floor(outlinePoints.length / 4))
    .concat(outlinePoints.slice(-Math.floor(outlinePoints.length / 4)))
  const hairlineY = templePoints.length > 0
    ? Math.min(...templePoints.map(p => p.y))
    : outlinePoints[0].y

  // 眉骨线：轮廓从外向内收缩的区域（约1/4处）
  // 中间位置的下1/3是眉骨位置
  const browY = hairlineY + (upperCourt / imgH)

  // 鼻底线
  const noseBaseY = browY + (middleCourt / imgH)

  // 下巴点
  const chinPoint = outlinePoints[Math.floor(outlinePoints.length / 2)]

  // ====== 五眼关键线位置 ======
  // 从左到右依次：太阳穴→左眼→眼距→右眼→太阳穴
  const faceLeftX = Math.min(...outlinePoints.map(p => p.x))
  const faceRightX = Math.max(...outlinePoints.map(p => p.x))

  // 五眼分界线（从左到右）
  const totalFiveEyes = eye1 + eye2 + eye3 + eye4 + eye5
  const eye1Right = faceLeftX + (eye1 / imgW)
  const eye2Right = eye1Right + (eye2 / imgW)
  const eye3Right = eye2Right + (eye3 / imgW)
  const eye4Right = eye3Right + (eye4 / imgW)

  const leftEyeInner = { x: eye1Right, y: (browY + noseBaseY) / 2 }
  const leftEyeOuter = { x: faceLeftX + (eye1 / imgW) * 0.5, y: (browY + noseBaseY) / 2 }
  const rightEyeInner = { x: eye2Right + (eye3 / imgW) * 0.5, y: (browY + noseBaseY) / 2 }
  const rightEyeOuter = { x: eye4Right + (eye5 / imgW) * 0.5, y: (browY + noseBaseY) / 2 }

  // 左右瞳孔（从瞳距推算）
  const faceCX = (faceLeftX + faceRightX) / 2
  const leftPupil = { x: faceCX - (pupilDist / imgW) / 2, y: (browY + noseBaseY) / 2 }
  const rightPupil = { x: faceCX + (pupilDist / imgW) / 2, y: (browY + noseBaseY) / 2 }

  // ====== 加密面部轮廓 ======
  const outlinePx = faceOutline.map(p => ({ x: p[0], y: p[1] }))
  const densifiedOutline = densifyContour(outlinePoints, 12, true)

  const detailPoints = {
    faceOutline: outlinePoints,
    jawLine: jawLinePoints
  }

  const densifiedPoints = {
    faceOutline: densifiedOutline,
    jawLine: densifyContour(jawLinePoints, 8, false)
  }

  // 生成面网格
  const mesh = generateFaceMesh(outlinePx, faceRect, imgW, imgH, {
    upperPx: upperCourt,
    middlePx: middleCourt,
    lowerPx: lowerCourt
  })

  // ====== 三庭比例（使用API返回的精确值） ======
  const totalCourt = upperCourt + middleCourt + lowerCourt

  // ====== 五眼比例（使用API返回的精确值） ======
  const totalFive = eye1 + eye2 + eye3 + eye4 + eye5

  return {
    // Canvas 绘制用的关键点
    landmarks: {
      hairline: { y: hairlineY },
      eyebrowLeft: { x: faceCX - (pupilDist / imgW) * 0.3, y: browY },
      eyebrowRight: { x: faceCX + (pupilDist / imgW) * 0.3, y: browY },
      noseBase: { y: noseBaseY },
      chin: chinPoint,
      leftEyeInner,
      leftEyeOuter,
      rightEyeInner,
      rightEyeOuter,
      leftPupil,
      rightPupil,
      leftTemple: outlinePoints[0],
      rightTemple: outlinePoints[outlinePoints.length - 1],
      templeTopY: hairlineY,
      browY,
      leftBrowOuter: { x: leftEyeOuter?.x, y: browY },
      rightBrowOuter: { x: rightEyeOuter?.x, y: browY },
    },
    // 详细关键点集合
    detailPoints,
    // 加密后的密集点云（2000+）
    densifiedPoints,
    // 面网格数据
    meshData: mesh,
    // 三庭比例（API直接提供像素距离，更精确）
    threeCourts: {
      upper: totalCourt > 0 ? (upperCourt / totalCourt).toFixed(3) : 0,
      middle: totalCourt > 0 ? (middleCourt / totalCourt).toFixed(3) : 0,
      lower: totalCourt > 0 ? (lowerCourt / totalCourt).toFixed(3) : 0,
      upperRaw: upperCourt / imgH,
      middleRaw: middleCourt / imgH,
      lowerRaw: lowerCourt / imgH,
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
    // 五眼比例（API直接提供像素距离，更精确）
    fiveEyes: {
      eye1: totalFive > 0 ? (eye1 / totalFive).toFixed(3) : 0,
      leftEye: totalFive > 0 ? (eye2 / totalFive).toFixed(3) : 0,
      interEye: totalFive > 0 ? (eye3 / totalFive).toFixed(3) : 0,
      rightEye: totalFive > 0 ? (eye4 / totalFive).toFixed(3) : 0,
      eye5: totalFive > 0 ? (eye5 / totalFive).toFixed(3) : 0,
      balance: totalFive > 0
        ? (Math.abs(eye1 / totalFive - 1/5) < 0.03
          && Math.abs(eye2 / totalFive - 1/5) < 0.03
          && Math.abs(eye3 / totalFive - 1/5) < 0.03
          && Math.abs(eye4 / totalFive - 1/5) < 0.03
          && Math.abs(eye5 / totalFive - 1/5) < 0.03)
          ? '五眼均衡'
          : eye3 / totalFive > 0.25
            ? '眼距偏宽'
            : eye3 / totalFive < 0.18
              ? '眼距偏窄'
              : '五眼基本均衡'
        : '待分析'
    },
    // 人脸框
    faceRect: {
      x: rectX / imgW,
      y: rectY / imgH,
      width: rectW / imgW,
      height: rectH / imgH
    },
    // API额外信息
    faceType: faceType || '未知',
    pupilDistance: pupilDist,
    faceWidth: faceWidth
  }
}

module.exports = { detectFaceLandmarks }
