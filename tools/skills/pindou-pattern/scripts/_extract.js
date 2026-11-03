// 色号数据同步工具：从 colorData.ts 源文件提取色号映射表，生成本目录的 colorData.js
// 用法: node _extract.js <path/to/colorData.ts>
// 说明: skill 自包含运行，不依赖 colorData.ts；仅在手头有色号源文件、需要更新数据时使用。
'use strict';

const fs = require('fs');
const path = require('path');

const tsPath = process.argv[2];
if (!tsPath) {
  console.error('用法: node _extract.js <path/to/colorData.ts>');
  console.error('示例: node _extract.js D:/work/colorData.ts');
  process.exit(1);
}
if (!fs.existsSync(tsPath)) {
  console.error('文件不存在: ' + tsPath);
  process.exit(1);
}

const ts = fs.readFileSync(tsPath, 'utf8');
const start = ts.indexOf('export const colorSystemMapping');
if (start === -1) {
  console.error('未找到 export const colorSystemMapping，请确认是 colorData.ts');
  process.exit(1);
}
const objStart = ts.indexOf('{', start);
const obj = ts.slice(objStart, ts.lastIndexOf('};') + 1);

const colorSystemMapping = eval('(' + obj + ')');
const keys = Object.keys(colorSystemMapping);
console.log('colors:', keys.length);

const brands = ['MARD', 'COCO', '漫漫', '盼盼', '咪小窝'];
let bad = 0;
for (const k of keys) {
  for (const b of brands) {
    if (!colorSystemMapping[k][b]) { bad++; console.log('missing', k, b); }
  }
}
console.log('missing fields:', bad);
if (bad > 0) process.exit(1);

const header = '// 自动提取自 colorData.ts —— 拼豆 5 大品牌色号映射表（提取工具: _extract.js）\n// 请勿手改；数据同步: node _extract.js <colorData.ts 路径>\n';
fs.writeFileSync(path.join(__dirname, 'colorData.js'), header + 'module.exports = ' + obj + ';\n');
console.log('written colorData.js');
