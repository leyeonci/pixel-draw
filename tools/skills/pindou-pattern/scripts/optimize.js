#!/usr/bin/env node
// AI 图片优化 CLI：把原图改为适合拼豆量化的风格（chibi + 白底 + 像素风）
// 提供方优先级（--provider auto）:
//   1. codex CLI 内置 imagegen（gpt-image-2，走用户 ChatGPT 订阅，免积分）
//   2. apiz CLI（apiz.ai 平台图生图，每次约 60 积分）
// 注：若当前 agent 自带图像生成工具（如 Codex 会话内的 image_gen），
//     应由 agent 直接调用（见 SKILL.md），无需经过本脚本。
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const http = require('http');
const https = require('https');
const os = require('os');
const path = require('path');

// 默认优化指令（用户指定）：chibi 画风 + 白底 + 像素风
// 依赖正确的参考图传参（--params image_urls），否则会退化为纯文生图
const DEFAULT_PROMPT = '图片修改为：chibi画风，背景白底。pixel art style, 16-bit, retro game aesthetic, sharp focus, high contrast, clean lines, detailed pixel art, masterpiece, best quality';
const APIZ_MODEL = 'openai/gpt-image-2/edit';
const CODEX_TIMEOUT_MS = 10 * 60 * 1000;   // codex exec 首次工具启动较慢
const APIZ_TIMEOUT_MS = 8.5 * 60 * 1000;
const MTIME_SKEW_MS = 2000;

const USAGE = `AI 图片优化（拼豆前置处理）

用法:
  node optimize.js <输入图片> [选项]

选项:
  --provider <name>  auto（默认）| codex | apiz
                      auto: 优先 codex CLI 内置 imagegen（免积分），不可用或失败时回退 apiz
  --prompt <text>    优化指令（默认内置 chibi+白底+像素风指令）
  --model <id>       apiz 图像编辑模型，默认 ${APIZ_MODEL}
  --out <path>       输出图片路径（默认 <输入名>_optimized.png/.jpg）

依赖（按所选提供方）:
  codex: codex CLI 已安装、已登录，且 image_generation 功能已开启
         （codex features enable image_generation）
  apiz:  apiz CLI 已安装并登录，每次约 60~65 积分(0.6元上下)
`;

function fail(msg) {
  console.error('错误: ' + msg);
  process.exit(1);
}

function parseArgs(argv) {
  const opts = { input: null, provider: 'auto', prompt: DEFAULT_PROMPT, model: APIZ_MODEL, out: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('-')) {
      if (opts.input) fail('只能有一个输入文件');
      opts.input = a;
    } else if (a === '--provider') { opts.provider = argv[++i]; }
    else if (a === '--prompt') { opts.prompt = argv[++i]; }
    else if (a === '--model') { opts.model = argv[++i]; }
    else if (a === '--out') { opts.out = argv[++i]; }
    else if (a === '--help' || a === '-h') { console.log(USAGE); process.exit(0); }
    else fail('未知选项: ' + a);
  }
  if (!opts.input) fail('缺少输入文件');
  if (!['auto', 'codex', 'apiz'].includes(opts.provider)) fail('--provider 只支持 auto | codex | apiz');
  return opts;
}

function run(cmd, args, timeoutMs) {
  try {
    return execFileSync(cmd, args, {
      encoding: 'utf8',
      timeout: timeoutMs,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });
  } catch (e) {
    const detail = ((e.stdout || '') + (e.stderr || '')).trim();
    if (e.code === 'ENOENT') throw new Error('未找到命令 ' + cmd);
    throw new Error(detail || e.message);
  }
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('http:') ? http : https;
    const req = mod.get(url, { timeout: 120000 }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return download(new URL(res.headers.location, url).toString(), dest).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error('下载失败 HTTP ' + res.statusCode + ': ' + url));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('下载超时')); });
  }).then(buf => fs.writeFileSync(dest, buf));
}

// ---------------- codex 提供方（内置 imagegen，免积分） ----------------

function codexUnavailableReason() {
  const which = process.platform === 'win32' ? 'where' : 'which';
  try {
    execFileSync(which, ['codex'], { stdio: 'ignore', timeout: 5000, windowsHide: true });
  } catch {
    return 'codex CLI 未安装';
  }
  let login;
  try { login = run('codex', ['login', 'status'], 10000); } catch (e) { return 'codex 未登录（' + e.message + '）'; }
  if (!login || !/logged in/i.test(login)) return 'codex 未登录（codex login）';
  let feats;
  try { feats = run('codex', ['features', 'list'], 10000); } catch (e) { return '无法读取 codex features（' + e.message + '）'; }
  if (!/\bimage_generation\b/.test(feats)) return 'image_generation 功能未开启（codex features enable image_generation 后重启会话）';
  return null;
}

function codexGeneratedDir() {
  return path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'generated_images');
}

// 取本次运行之后新生成的图片（容忍 mtime 偏差，防止拿到旧文件）
function freshestGeneratedImage(sinceMs) {
  const dir = codexGeneratedDir();
  if (!fs.existsSync(dir)) return null;
  const floor = sinceMs - MTIME_SKEW_MS;
  let best = null;
  for (const name of fs.readdirSync(dir)) {
    let st;
    try { st = fs.statSync(path.join(dir, name)); } catch { continue; }
    if (!st.isFile() || st.mtimeMs < floor) continue;
    if (!best || st.mtimeMs > best.mtimeMs) best = { p: path.join(dir, name), mtimeMs: st.mtimeMs };
  }
  return best ? best.p : null;
}

async function optimizeViaCodex(inputPath, prompt, outPath) {
  const sinceMs = Date.now();
  // codex exec 内的 agent 读取本地原图、调用其内置图像工具编辑；
  // 产物会自动落在 $CODEX_HOME/generated_images/，随后我们取最新文件
  const instruction =
    `请读取本地图片 ${inputPath} ，使用你内置的图像生成工具（image_gen）按以下指令对它进行编辑：` +
    `${prompt} 。生成完成后，同时把结果图片保存一份到 ${outPath} 。`;
  run('codex', ['exec', '--enable', 'imagegenext', instruction], CODEX_TIMEOUT_MS);

  let src = fs.existsSync(outPath) ? outPath : freshestGeneratedImage(sinceMs);
  if (!src) throw new Error('codex 运行完成但未找到生成图片（检查 ~/.codex/generated_images/）');
  if (src !== path.resolve(outPath)) {
    fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
    fs.copyFileSync(src, path.resolve(outPath));
  }
  return { via: 'codex(imagegen)', detail: '源文件: ' + src };
}

// ---------------- apiz 提供方（图生图，约 60 积分/次） ----------------

async function optimizeViaApiz(inputPath, prompt, model, outPath) {
  const uploadOut = run('apiz', ['upload', inputPath, '--json'], 120000);
  let upload;
  try { upload = JSON.parse(uploadOut); } catch { throw new Error('解析 apiz upload 输出失败: ' + uploadOut); }
  if (!upload.public_url) throw new Error('上传失败，未返回 public_url');

  const genOut = run('apiz', [
    'generate', prompt,
    // 注意: CLI 的 --image-url 对部分模型不生效（实测被忽略退化为文生图），
    // 正确做法是 --params 传 image_urls 数组（编辑模式必需参数）
    '--params', JSON.stringify({ image_urls: [upload.public_url] }),
    '--model', model,
    '--wait', '--wait-timeout', '8m',
    '--json'
  ], APIZ_TIMEOUT_MS);
  let task;
  try { task = JSON.parse(genOut); } catch { throw new Error('解析 apiz generate 输出失败: ' + genOut.slice(0, 500)); }
  if (task.status !== 'completed') throw new Error('生成任务未完成，状态: ' + task.status + '（task_id: ' + task.task_id + '）');
  const image = task.result && task.result.images && task.result.images[0];
  if (!image || !image.url) throw new Error('结果中没有图片 URL');

  fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
  await download(image.url, outPath);
  if (!fs.existsSync(outPath) || fs.statSync(outPath).size === 0) throw new Error('下载结果为空');
  return { via: 'apiz/' + task.model, detail: `耗时积分: ${task.price} | 任务: ${task.task_id}` };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const inputPath = path.resolve(opts.input);
  if (!fs.existsSync(inputPath)) fail('输入文件不存在: ' + inputPath);

  let result = null;
  if (opts.provider === 'auto' || opts.provider === 'codex') {
    const reason = codexUnavailableReason();
    if (reason) {
      if (opts.provider === 'codex') fail(reason + '；或改用 --provider apiz');
      console.error('codex imagegen 不可用: ' + reason + '，改用 apiz');
    } else {
      const outPath = path.resolve(opts.out || inputPath.replace(/\.[^.]+$/, '') + '_optimized.png');
      try {
        result = await optimizeViaCodex(inputPath, opts.prompt, outPath);
        opts._out = outPath;
      } catch (e) {
        if (opts.provider === 'codex') fail('codex 优化失败: ' + e.message);
        console.error('codex 路径失败，回退 apiz: ' + e.message);
      }
    }
  }

  if (!result) {
    const extFromOut = opts.out ? path.extname(opts.out) : '';
    let outPath = opts._out || opts.out;
    if (!outPath) {
      // apiz 结果为 jpg
      outPath = inputPath.replace(/\.[^.]+$/, '') + '_optimized' + (extFromOut || '.jpg');
    }
    outPath = path.resolve(outPath);
    try {
      result = await optimizeViaApiz(inputPath, opts.prompt, opts.model, outPath);
      opts._out = outPath;
    } catch (e) {
      fail('apiz 优化失败: ' + e.message);
    }
  }

  console.log(`优化完成: ${opts._out}`);
  console.log(`提供方: ${result.via} | ${result.detail}`);
  console.log('下一步: node .agents/skills/pindou-pattern/scripts/generate.js "' + opts._out + '" --blank-white --max-colors 16 ...');
}

main().catch(e => { console.error('优化失败:', e.message); process.exit(1); });
