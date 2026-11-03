// 拼豆图纸核心算法：颜色量化、色号统计、SVG 图纸生成
'use strict';

const colorSystemMapping = require('./colorData');

const COLOR_SYSTEMS = ['MARD', 'COCO', '漫漫', '盼盼', '咪小窝'];
const ALL_HEX = Object.keys(colorSystemMapping);

// ---------------- 颜色基础工具 ----------------

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(x => {
    const h = Math.round(x).toString(16);
    return h.length === 1 ? '0' + h : h;
  }).join('').toUpperCase();
}

// Luma 公式：>0.5 视为浅色背景（黑字），否则白字
function getContrastColor(hex) {
  const { r, g, b } = hexToRgb(hex);
  const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luma > 0.5 ? '#000000' : '#FFFFFF';
}

function rgbDistance(c1, c2) {
  const dr = c1.r - c2.r;
  const dg = c1.g - c2.g;
  const db = c1.b - c2.b;
  return dr * dr + dg * dg + db * db;
}

// sRGB -> CIE Lab（D65），用于感知色差匹配
function rgbToLab({ r, g, b }) {
  const f = x => {
    x /= 255;
    return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  };
  const [rl, gl, bl] = [f(r), f(g), f(b)];
  let x = (rl * 0.4124 + gl * 0.3576 + bl * 0.1805) / 0.95047;
  let y = rl * 0.2126 + gl * 0.7152 + bl * 0.0722;
  let z = (rl * 0.0193 + gl * 0.1192 + bl * 0.9505) / 1.08883;
  const g2 = t => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  x = g2(x); y = g2(y); z = g2(z);
  return { L: 116 * y - 16, a: 500 * (x - y), b: 200 * (y - z) };
}

function labDistance(c1, c2) {
  const dL = c1.L - c2.L;
  const da = c1.a - c2.a;
  const db = c1.b - c2.b;
  return dL * dL + da * da + db * db;
}

/**
 * 在调色板中找最接近的颜色
 * @param hex 目标 HEX 颜色
 * @param palette HEX 数组
 * @param mode 'rgb'（欧氏距离）| 'lab'（感知色差，通常更接近人眼判断）
 */
function findClosestColor(hex, palette = ALL_HEX, mode = 'rgb') {
  if (palette.includes(hex)) return hex;
  const target = hexToRgb(hex);
  if (mode === 'lab') {
    const targetLab = rgbToLab(target);
    let best = palette[0];
    let bestDist = Infinity;
    for (const p of palette) {
      const d = labDistance(targetLab, rgbToLab(hexToRgb(p)));
      if (d < bestDist) { bestDist = d; best = p; }
    }
    return best;
  }
  let best = palette[0];
  let bestDist = Infinity;
  for (const p of palette) {
    const d = rgbDistance(target, hexToRgb(p));
    if (d < bestDist) { bestDist = d; best = p; }
  }
  return best;
}

// ---------------- 色号与统计 ----------------

function getColorKeyByHex(hex, colorSystem) {
  const m = colorSystemMapping[hex.toUpperCase()];
  return m ? m[colorSystem] : hex;
}

// 统计各颜色用量，排除 #FFFFFF（空格不买豆子）
function countColors(pixelData) {
  const counts = {};
  for (const color of pixelData) {
    if (color === '#FFFFFF') continue;
    const key = color.toUpperCase();
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function sortedColorKeys(counts) {
  return Object.keys(counts).sort((a, b) => a.localeCompare(b));
}

/**
 * 色数收敛：把用量最少的颜色合并到视觉最接近的高频色
 * 用于照片/AI 优化图量化后颜色过散（如 100+ 色）的场景，让物料清单可采购
 * @param pixelData 像素数组（值为调色板内 HEX）
 * @param maxColors 保留的颜色数上限（>=2）
 * @param mode 'rgb' | 'lab'
 */
function limitColors(pixelData, maxColors, mode = 'rgb') {
  const counts = countColors(pixelData);
  const keys = Object.keys(counts);
  if (keys.length <= maxColors) return pixelData;

  // 按用量降序保留前 maxColors 种，其余映射到最近的保留色
  const kept = keys.sort((a, b) => counts[b] - counts[a]).slice(0, maxColors);
  const remap = {};
  for (const k of keys) {
    if (kept.includes(k)) { remap[k] = k; continue; }
    remap[k] = findClosestColor(k, kept, mode);
  }
  return pixelData.map(c => (c === '#FFFFFF' ? c : remap[c] || c));
}

// CSV 物料清单（带 BOM，Excel 打开中文不乱码）
function buildStatsCSV(pixelData, colorSystem) {
  const counts = countColors(pixelData);
  const keys = sortedColorKeys(counts);
  const total = keys.reduce((s, k) => s + counts[k], 0);
  const lines = ['\uFEFF色号,HEX颜色,数量(颗)'];
  for (const k of keys) {
    lines.push(`${getColorKeyByHex(k, colorSystem)},${k},${counts[k]}`);
  }
  lines.push(`总计,${keys.length} 种,${total}`);
  return lines.join('\n') + '\n';
}

// ---------------- SVG 图纸生成 ----------------

function escapeXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const FONT_STACK = "Microsoft YaHei, PingFang SC, Noto Sans CJK SC, sans-serif";

/**
 * 生成拼豆图纸 SVG
 * @param data {gridSize, pixelData}
 * @param options {showGrid, gridInterval, showCoordinates, showCellNumbers, gridLineColor, includeStats}
 * @param colorSystem 5 大品牌之一
 * @param title 图纸标题
 * @param watermark 水印文字（空字符串则不显示）
 */
function buildPatternSVG(data, options, colorSystem = 'MARD', title = '拼豆图纸', watermark = 'pindou.348349.xyz') {
  const { gridSize: N, pixelData } = data;
  const M = N;
  const CELL = 30;
  const {
    showGrid = true,
    gridInterval = 10,
    showCoordinates = true,
    showCellNumbers = true,
    gridLineColor = '#555555',
    includeStats = true
  } = options;

  // ---- 尺寸计算 ----
  const axisLabelSize = showCoordinates ? Math.max(30, Math.floor(CELL)) : 0;
  const statsPadding = 20;
  const preCalcWidth = N * CELL + axisLabelSize;
  const preCalcAvailableWidth = preCalcWidth - statsPadding * 2;
  const widthFactor = Math.max(0, preCalcAvailableWidth - 350) / 600;
  const statsFontSize = Math.floor(13 + widthFactor * 10);

  const extraLeftMargin = showCoordinates ? Math.max(20, statsFontSize * 2) : 0;
  const extraRightMargin = showCoordinates ? Math.max(20, statsFontSize * 2) : 0;
  const extraTopMargin = showCoordinates ? Math.max(15, statsFontSize) : 0;
  const extraBottomMargin = showCoordinates ? Math.max(15, statsFontSize) : 0;

  const gridWidth = N * CELL;
  const gridHeight = M * CELL;
  const initialWidth = gridWidth + axisLabelSize + extraLeftMargin;
  const titleBarScale = Math.max(1.0, Math.min(2.0, initialWidth / 1000));
  const titleBarHeight = Math.floor(80 * titleBarScale);
  const titleFontSize = Math.max(28, Math.floor(28 * titleBarScale));

  const colorCounts = countColors(pixelData);
  const totalBeadCount = Object.values(colorCounts).reduce((s, c) => s + c, 0);
  const colorKeys = sortedColorKeys(colorCounts);

  let statsHeight = 0;
  if (includeStats && colorKeys.length > 0) {
    const numColumns = Math.max(1, Math.min(4, Math.floor(preCalcAvailableWidth / 250)));
    const swatchSize = Math.floor(18 + widthFactor * 20);
    const numRows = Math.ceil(colorKeys.length / numColumns);
    const statsRowHeight = Math.max(swatchSize + 8, 25);
    statsHeight = 40 + numRows * statsRowHeight + 40 + statsPadding * 2 + 24;
  }

  const downloadWidth = gridWidth + axisLabelSize * 2 + extraLeftMargin + extraRightMargin;
  const downloadHeight = titleBarHeight + gridHeight + axisLabelSize * 2 + statsHeight + extraTopMargin + extraBottomMargin;

  const gridX = extraLeftMargin + axisLabelSize;
  const gridY = titleBarHeight + extraTopMargin + axisLabelSize;

  const svg = [];
  svg.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${downloadWidth}" height="${downloadHeight}" viewBox="0 0 ${downloadWidth} ${downloadHeight}">`);
  svg.push(`<defs><linearGradient id="brand" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="#6366F1"/><stop offset="1" stop-color="#8B5CF6"/></linearGradient></defs>`);

  // 白底 + 深色标题栏
  svg.push(`<rect width="${downloadWidth}" height="${downloadHeight}" fill="#FFFFFF"/>`);
  svg.push(`<rect width="${downloadWidth}" height="${titleBarHeight}" fill="#1F2937"/>`);

  // 品牌渐变块 + 3×3 拼豆 Logo
  const brandBlockWidth = titleBarHeight * 0.8;
  svg.push(`<rect width="${brandBlockWidth}" height="${titleBarHeight}" fill="url(#brand)"/>`);
  const logoSize = titleBarHeight * 0.4;
  const beadSize = logoSize / 4;
  const beadSpacing = beadSize * 1.2;
  const logoCX = brandBlockWidth / 2;
  const logoCY = titleBarHeight / 2;
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const bx = logoCX - logoSize / 2 + col * beadSpacing;
      const by = logoCY - logoSize / 2 + row * beadSpacing;
      svg.push(`<rect x="${bx.toFixed(2)}" y="${by.toFixed(2)}" width="${beadSize.toFixed(2)}" height="${beadSize.toFixed(2)}" rx="${(beadSize * 0.2).toFixed(2)}" fill="#FFFFFF"/>`);
    }
  }

  // 标题 + 副标题
  const mainTitleFontSize = Math.max(20, Math.floor(titleFontSize * 0.8));
  const subTitleFontSize = Math.max(12, Math.floor(titleFontSize * 0.45));
  const titleStartX = brandBlockWidth + titleBarHeight * 0.3;
  const titleText = watermark ? `${title}（${watermark}）` : title;
  svg.push(`<text x="${titleStartX.toFixed(1)}" y="${titleBarHeight * 0.4}" font-family="${FONT_STACK}" font-size="${mainTitleFontSize}" font-weight="600" fill="#FFFFFF" dominant-baseline="central">${escapeXml(titleText)}</text>`);
  svg.push(`<text x="${titleStartX.toFixed(1)}" y="${titleBarHeight * 0.65}" font-family="${FONT_STACK}" font-size="${subTitleFontSize}" fill="#FFFFFF" fill-opacity="0.8" dominant-baseline="central">${N}x${M} 网格</text>`);

  // 坐标轴（四周，四边条 + 第 1/最后/每隔 interval 格标注 1 基编号）
  if (showCoordinates) {
    const stripTopY = titleBarHeight + extraTopMargin;
    const stripBottomY = gridY + gridHeight;
    svg.push(`<rect x="${gridX}" y="${stripTopY}" width="${gridWidth}" height="${axisLabelSize}" fill="#F5F5F5"/>`);
    svg.push(`<rect x="${gridX}" y="${stripBottomY}" width="${gridWidth}" height="${axisLabelSize}" fill="#F5F5F5"/>`);
    svg.push(`<rect x="${extraLeftMargin}" y="${gridY}" width="${axisLabelSize}" height="${gridHeight}" fill="#F5F5F5"/>`);
    svg.push(`<rect x="${gridX + gridWidth}" y="${gridY}" width="${axisLabelSize}" height="${gridHeight}" fill="#F5F5F5"/>`);

    const labelAttrs = `font-family="${FONT_STACK}" font-size="14" fill="#333333" text-anchor="middle" dominant-baseline="central"`;
    for (let i = 0; i < N; i++) {
      if ((i + 1) % gridInterval === 0 || i === 0 || i === N - 1) {
        const x = gridX + i * CELL + CELL / 2;
        svg.push(`<text x="${x}" y="${stripTopY + axisLabelSize / 2}" ${labelAttrs}>${i + 1}</text>`);
        svg.push(`<text x="${x}" y="${stripBottomY + axisLabelSize / 2}" ${labelAttrs}>${i + 1}</text>`);
      }
    }
    for (let j = 0; j < M; j++) {
      if ((j + 1) % gridInterval === 0 || j === 0 || j === M - 1) {
        const y = gridY + j * CELL + CELL / 2;
        svg.push(`<text x="${extraLeftMargin + axisLabelSize / 2}" y="${y}" ${labelAttrs}>${j + 1}</text>`);
        svg.push(`<text x="${gridX + gridWidth + axisLabelSize / 2}" y="${y}" ${labelAttrs}>${j + 1}</text>`);
      }
    }
  }

  // 色块 + 格内色号（白格留空）
  const cellFontSize = Math.max(8, Math.floor(CELL * 0.4));
  for (let j = 0; j < M; j++) {
    for (let i = 0; i < N; i++) {
      const color = pixelData[j * N + i];
      if (color === '#FFFFFF') continue;
      const x = gridX + i * CELL;
      const y = gridY + j * CELL;
      svg.push(`<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" fill="${color}"/>`);
      if (showCellNumbers) {
        const key = getColorKeyByHex(color, colorSystem);
        svg.push(`<text x="${x + CELL / 2}" y="${y + CELL / 2}" font-family="${FONT_STACK}" font-size="${cellFontSize}" font-weight="bold" fill="${getContrastColor(color)}" text-anchor="middle" dominant-baseline="central">${escapeXml(key)}</text>`);
      }
    }
  }

  // 每格浅灰细线（合并为单 path）
  let lightPath = '';
  for (let i = 0; i <= N; i++) {
    const x = gridX + i * CELL;
    lightPath += `M${x} ${gridY}V${gridY + gridHeight}`;
  }
  for (let j = 0; j <= M; j++) {
    const y = gridY + j * CELL;
    lightPath += `M${gridX} ${y}H${gridX + gridWidth}`;
  }
  svg.push(`<path d="${lightPath}" stroke="#DDDDDD" stroke-width="0.5" fill="none"/>`);

  // 每隔 interval 格加重线
  if (showGrid) {
    let heavyPath = '';
    for (let i = gridInterval; i < N; i += gridInterval) {
      const x = gridX + i * CELL;
      heavyPath += `M${x} ${gridY}V${gridY + gridHeight}`;
    }
    for (let j = gridInterval; j < M; j += gridInterval) {
      const y = gridY + j * CELL;
      heavyPath += `M${gridX} ${y}H${gridX + gridWidth}`;
    }
    if (heavyPath) {
      svg.push(`<path d="${heavyPath}" stroke="${gridLineColor}" stroke-width="1.5" fill="none"/>`);
    }
  }

  // 外边框
  svg.push(`<rect x="${gridX}" y="${gridY}" width="${gridWidth}" height="${gridHeight}" fill="none" stroke="#000000" stroke-width="1.5"/>`);

  // 色号统计区
  if (includeStats && colorKeys.length > 0) {
    const statsTopMargin = 24;
    const statsY = titleBarHeight + extraTopMargin + M * CELL + axisLabelSize * 2 + statsPadding + statsTopMargin;
    const availableStatsWidth = downloadWidth - statsPadding * 2;
    const renderNumColumns = Math.max(1, Math.min(4, Math.floor(availableStatsWidth / 250)));
    const swatchSize = Math.floor(18 + widthFactor * 20);
    const itemWidth = Math.floor(availableStatsWidth / renderNumColumns);
    const titleHeight = 30;
    const statsRowHeight = Math.max(swatchSize + 8, 25);

    svg.push(`<text x="${statsPadding}" y="${statsY + 15}" font-family="${FONT_STACK}" font-size="${Math.max(16, statsFontSize)}" font-weight="bold" fill="#333333">色号统计</text>`);
    svg.push(`<line x1="${statsPadding}" y1="${statsY + 20}" x2="${downloadWidth - statsPadding}" y2="${statsY + 20}" stroke="#DDDDDD" stroke-width="1"/>`);

    colorKeys.forEach((key, index) => {
      const rowIndex = Math.floor(index / renderNumColumns);
      const colIndex = index % renderNumColumns;
      const itemX = statsPadding + colIndex * itemWidth;
      const rowY = statsY + titleHeight + rowIndex * statsRowHeight + swatchSize / 2;
      const count = colorCounts[key];

      svg.push(`<rect x="${itemX}" y="${rowY - swatchSize / 2}" width="${swatchSize}" height="${swatchSize}" fill="${key}" stroke="#CCCCCC" stroke-width="1"/>`);
      svg.push(`<text x="${itemX + swatchSize + 5}" y="${rowY}" font-family="${FONT_STACK}" font-size="${statsFontSize}" fill="#333333" dominant-baseline="central">${escapeXml(getColorKeyByHex(key, colorSystem))}</text>`);
      const countX = renderNumColumns === 1 ? downloadWidth - statsPadding : itemX + itemWidth - 10;
      svg.push(`<text x="${countX}" y="${rowY}" font-family="${FONT_STACK}" font-size="${statsFontSize}" fill="#333333" text-anchor="end" dominant-baseline="central">${count} 颗</text>`);
    });

    const numRows = Math.ceil(colorKeys.length / renderNumColumns);
    const totalY = statsY + titleHeight + numRows * statsRowHeight + 10;
    svg.push(`<text x="${downloadWidth - statsPadding}" y="${totalY}" font-family="${FONT_STACK}" font-size="${statsFontSize}" font-weight="bold" fill="#333333" text-anchor="end">总计: ${totalBeadCount} 颗</text>`);
  }

  svg.push('</svg>');
  return { svg: svg.join('\n'), width: downloadWidth, height: downloadHeight, colorCounts, colorKeys, totalBeadCount };
}

module.exports = {
  COLOR_SYSTEMS,
  ALL_HEX,
  hexToRgb,
  rgbToHex,
  getContrastColor,
  findClosestColor,
  getColorKeyByHex,
  countColors,
  sortedColorKeys,
  limitColors,
  buildStatsCSV,
  buildPatternSVG
};
