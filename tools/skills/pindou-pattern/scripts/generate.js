#!/usr/bin/env node
// 拼豆图纸生成 CLI
// 用法: node generate.js <输入图片|输入.json> [选项]
// 输入为图片时先量化到 N×N 网格；输入为 JSON ({gridSize, pixelData}) 时直接渲染。
'use strict';

const fs = require('fs');
const path = require('path');
const {
  COLOR_SYSTEMS,
  ALL_HEX,
  rgbToHex,
  findClosestColor,
  getColorKeyByHex,
  limitColors,
  buildStatsCSV,
  buildPatternSVG
} = require('./pattern');

const USAGE = `拼豆图纸生成器

用法:
  node generate.js <输入> [选项]

输入:
  图片文件 (.png/.jpg/.jpeg/.webp/.bmp/.tiff)  量化为 N×N 拼豆网格
  JSON 文件 {"gridSize": N, "pixelData": ["#FFFFFF", ...]}  行优先一维数组，长度 = N²，#FFFFFF = 空格

选项:
  --size <n>          网格尺寸 N×N，默认 32（图片输入时生效；JSON 以文件内 gridSize 为准）
  --system <name>     色号系统: MARD | COCO | 漫漫 | 盼盼 | 咪小窝，默认 MARD
  --title <text>      图纸标题，默认 "拼豆图纸"
  --out <path>        输出 PNG 路径，默认 <输入名>_pattern.png
  --interval <n>      加重网格线间隔，默认 10
  --grid-color <hex>  加重网格线颜色，默认 #555555
  --match <mode>      颜色匹配算法: rgb（默认，欧氏距离） | lab（感知色差，通常更准）
  --blank-white       图片量化时将近白色当作空格 #FFFFFF（背景不买白豆）
  --white-threshold <n> 近白判定阈值 1~255（配合 --blank-white，默认 240。
                      AI 生成的白底常带 ±10 偏色，如 245,251,251；调低更激进留空，调高保留浅色豆）
  --max-colors <n>    色数收敛上限（2~205）：按用量保留前 n 色，低频色合并到最接近的保留色（推荐照片/AI 优化图设 12~24）
  --no-snap           JSON 输入时不把非调色板颜色吸附到最近色号（默认吸附，保证色号可买）
  --csv <path>        同时导出色号用量 CSV 物料清单
  --watermark <text>  标题水印，默认 pindou.348349.xyz，传空串去除
  --no-grid           不画加重网格线
  --no-coordinates    不画四周坐标
  --no-cellnumbers    格内不标色号
  --no-stats          不含色号统计区
`;

function fail(msg) {
  console.error('错误: ' + msg);
  console.error('\n' + USAGE);
  process.exit(1);
}

function parseArgs(argv) {
  const opts = {
    input: null,
    size: 32,
    system: 'MARD',
    title: '拼豆图纸',
    out: null,
    interval: 10,
    gridColor: '#555555',
    match: 'rgb',
    blankWhite: false,
    whiteThreshold: 240,
    maxColors: 0,
    snap: true,
    csv: null,
    watermark: 'pindou.348349.xyz',
    showGrid: true,
    showCoordinates: true,
    showCellNumbers: true,
    includeStats: true
  };
  const flags = {
    '--size': v => { opts.size = parseInt(v, 10); },
    '--system': v => { opts.system = v; },
    '--title': v => { opts.title = v; },
    '--out': v => { opts.out = v; },
    '--interval': v => { opts.interval = parseInt(v, 10); },
    '--grid-color': v => { opts.gridColor = v; },
    '--match': v => { opts.match = v; },
    '--white-threshold': v => { opts.whiteThreshold = parseInt(v, 10); },
    '--max-colors': v => { opts.maxColors = parseInt(v, 10); },
    '--csv': v => { opts.csv = v; },
    '--watermark': v => { opts.watermark = v; },
    '--blank-white': () => { opts.blankWhite = true; },
    '--no-snap': () => { opts.snap = false; },
    '--no-grid': () => { opts.showGrid = false; },
    '--no-coordinates': () => { opts.showCoordinates = false; },
    '--no-cellnumbers': () => { opts.showCellNumbers = false; },
    '--no-stats': () => { opts.includeStats = false; },
    '--help': () => { console.log(USAGE); process.exit(0); },
    '-h': () => { console.log(USAGE); process.exit(0); }
  };
  // 需要参数值的选项；未列出的 flag 一律按布尔开关处理
  const valueFlags = new Set(['--size', '--system', '--title', '--out', '--interval', '--grid-color', '--match', '--white-threshold', '--max-colors', '--csv', '--watermark']);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('-')) {
      if (opts.input) fail('只能有一个输入文件: ' + a);
      opts.input = a;
      continue;
    }
    const handler = flags[a];
    if (!handler) fail('未知选项: ' + a);
    if (valueFlags.has(a)) {
      const v = argv[++i];
      if (v === undefined) fail(a + ' 需要一个参数值');
      handler(v);
    } else {
      handler();
    }
  }
  if (!opts.input) fail('缺少输入文件');
  if (!Number.isInteger(opts.size) || opts.size < 4 || opts.size > 150) fail('--size 需为 4~150 的整数');
  if (!Number.isInteger(opts.interval) || opts.interval < 1) fail('--interval 需为 >= 1 的整数');
  if (opts.maxColors !== 0 && (!Number.isInteger(opts.maxColors) || opts.maxColors < 2 || opts.maxColors > 205)) fail('--max-colors 需为 2~205 的整数');
  if (!Number.isInteger(opts.whiteThreshold) || opts.whiteThreshold < 1 || opts.whiteThreshold > 255) fail('--white-threshold 需为 1~255 的整数');
  if (!COLOR_SYSTEMS.includes(opts.system)) fail('未知色号系统 "' + opts.system + '"，可选: ' + COLOR_SYSTEMS.join(' | '));
  if (!['rgb', 'lab'].includes(opts.match)) fail('--match 只支持 rgb 或 lab');
  if (!/^#[0-9A-Fa-f]{6}$/.test(opts.gridColor)) fail('--grid-color 需为 #RRGGBB 格式');
  return opts;
}

function loadJsonInput(file) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    fail('JSON 解析失败: ' + e.message);
  }
  const { gridSize, pixelData } = parsed;
  if (!Number.isInteger(gridSize) || !Array.isArray(pixelData)) {
    fail('JSON 需包含 gridSize (整数) 与 pixelData (数组)');
  }
  if (pixelData.length !== gridSize * gridSize) {
    fail(`pixelData 长度 ${pixelData.length} != gridSize² ${gridSize * gridSize}`);
  }
  const normalized = pixelData.map(c => String(c).toUpperCase());
  const badIdx = normalized.findIndex(c => !/^#[0-9A-F]{6}$/.test(c));
  if (badIdx !== -1) fail(`pixelData[${badIdx}] 含非法颜色 "${pixelData[badIdx]}"，需为 #RRGGBB 格式（#FFFFFF 表示空格）`);
  return { gridSize, pixelData: normalized };
}

async function loadImageInput(file, sharp, opts) {
  let raw;
  try {
    raw = await sharp(file)
      // removeAlpha 只丢弃 alpha 通道，透明处的 RGB 为 0，须先合成白底否则会量化成黑豆
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .resize(opts.size, opts.size, { fit: 'contain', background: { r: 255, g: 255, b: 255 } })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
  } catch (e) {
    fail('图片读取失败: ' + e.message);
  }
  const { data, info } = raw;
  const { width, height, channels } = info;
  if (width !== opts.size || height !== opts.size) {
    fail(`缩放结果 ${width}x${height} 与目标 ${opts.size} 不符`);
  }
  const pixelData = [];
  for (let row = 0; row < opts.size; row++) {
    for (let col = 0; col < opts.size; col++) {
      const idx = (row * width + col) * channels;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      if (opts.blankWhite && r >= opts.whiteThreshold && g >= opts.whiteThreshold && b >= opts.whiteThreshold) {
        pixelData.push('#FFFFFF');
      } else {
        pixelData.push(findClosestColor(rgbToHex(r, g, b), ALL_HEX, opts.match));
      }
    }
  }
  return { gridSize: opts.size, pixelData };
}

function snapJsonPalette(pixelData, match) {
  // #FFFFFF 是空格标记，必须保留，不能吸附成近白色豆子
  return pixelData.map(c => c === '#FFFFFF' ? c : findClosestColor(c, ALL_HEX, match));
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const inputPath = path.resolve(opts.input);
  if (!fs.existsSync(inputPath)) fail('输入文件不存在: ' + inputPath);

  let sharp;
  try {
    sharp = require('sharp');
  } catch (e) {
    fail('缺少依赖 sharp。请在 skill 根目录（.agents/skills/pindou-pattern/，含 package.json）执行: npm install。' +
      '依赖按脚本所在路径向上查找 node_modules，与当前运行目录无关');
  }

  const ext = path.extname(inputPath).toLowerCase();
  const isImage = ['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tiff', '.tif', '.gif'].includes(ext);

  let data;
  if (ext === '.json') {
    data = loadJsonInput(inputPath);
    if (opts.snap) data.pixelData = snapJsonPalette(data.pixelData, opts.match);
  } else if (isImage) {
    data = await loadImageInput(inputPath, sharp, opts);
  } else {
    fail('不支持的输入类型 ' + ext + '，请提供图片或 .json 文件');
  }
  if (opts.maxColors > 0) {
    data.pixelData = limitColors(data.pixelData, opts.maxColors, opts.match);
  }

  const outPath = path.resolve(opts.out || (
    inputPath.replace(/\.[^.]+$/, '') + '_pattern.png'
  ));
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const result = buildPatternSVG(data, {
    showGrid: opts.showGrid,
    gridInterval: opts.interval,
    showCoordinates: opts.showCoordinates,
    showCellNumbers: opts.showCellNumbers,
    gridLineColor: opts.gridColor,
    includeStats: opts.includeStats
  }, opts.system, opts.title, opts.watermark);

  await sharp(Buffer.from(result.svg), { density: 72 }).png().toFile(outPath);

  if (opts.csv) {
    const csvPath = path.resolve(opts.csv);
    fs.mkdirSync(path.dirname(csvPath), { recursive: true });
    fs.writeFileSync(csvPath, buildStatsCSV(data.pixelData, opts.system), 'utf8');
    console.log('CSV 物料清单: ' + csvPath);
  }

  console.log(`图纸已生成: ${outPath} (${result.width}x${result.height} px)`);
  console.log(`网格: ${data.gridSize}x${data.gridSize} | 色号系统: ${opts.system} | 用色: ${result.colorKeys.length} 种 | 总豆数: ${result.totalBeadCount} 颗`);
  console.log(result.colorKeys
    .map(k => `${getColorKeyByHex(k, opts.system)} ×${result.colorCounts[k]}`)
    .join(' | '));
}

main().catch(e => { console.error('生成失败:', e); process.exit(1); });
