import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readmePath = resolve(root, 'README.md');
const readme = readFileSync(readmePath, 'utf8');
const failures = [];

const phrases = ['支流', '非线性脑图对话', '线性', '对话列表', '展开', '收起', '注册', '登录', '子问题', '同级'];
for (const phrase of phrases) {
  if (!readme.includes(phrase)) failures.push(`README.md 缺少「${phrase}」`);
}

for (const heading of ['为什么', '是什么', '怎么用']) {
  if (!new RegExp(`^##\\s+.*${heading}`, 'm').test(readme)) {
    failures.push(`README.md 缺少含「${heading}」的二级标题`);
  }
}

const imageExt = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']);
const linked = [];
const linkRe = /!\[[^\]]*\]\(([^)]+)\)|\[[^\]]*\]\(([^)]+)\)/g;
for (const match of readme.matchAll(linkRe)) {
  let href = (match[1] ?? match[2] ?? '').trim();
  if (href.startsWith('<') && href.endsWith('>')) href = href.slice(1, -1).trim();
  href = href.split(/\s+/)[0] ?? '';
  if (!href || /^(?:https?:|mailto:|#)/.test(href)) continue;
  const clean = decodeURIComponent(href.split('#')[0]?.split('?')[0] ?? '');
  if (!clean) continue;
  const ext = extname(clean).toLowerCase();
  if (ext !== '.md' && !imageExt.has(ext)) continue;
  const abs = resolve(dirname(readmePath), clean);
  linked.push({ href, abs, ext });
  if (!existsSync(abs)) {
    failures.push(`相对链接打不开: ${href}`);
    continue;
  }
  if (imageExt.has(ext) && statSync(abs).size === 0) failures.push(`图片是空文件: ${href}`);
}

const markdown = linked.filter((item) => item.ext === '.md');
const images = linked.filter((item) => imageExt.has(item.ext));
if (markdown.length < 3) failures.push('README.md 指向 Markdown 的相对链接少于 3 个');
if (images.length < 1) failures.push('README.md 没有指向图片的相对链接');

const docs = markdown
  .filter((item) => existsSync(item.abs))
  .map((item) => readFileSync(item.abs, 'utf8'))
  .join('\n');
const docFacts = [
  ['pnpm install', /pnpm install/],
  ['cp .env.example .env', /cp \.env\.example \.env/],
  ['bootstrap-db', /pnpm --filter @tributary\/server exec tsx scripts\/bootstrap-db\.ts/],
  ['pnpm dev', /(?:^|\n)pnpm dev(?:\n|$)/],
  ['pnpm dev:worker', /(?:^|\n)pnpm dev:worker(?:\n|$)/],
  ['pnpm dev:web', /(?:^|\n)pnpm dev:web(?:\n|$)/],
  ['127.0.0.1:8788', /127\.0\.0\.1:8788/],
  ['127.0.0.1:5173', /127\.0\.0\.1:5173/],
  ['/api', /\/api/],
  ['jobs', /jobs/],
  ['pnpm build', /(?:^|\n)pnpm build(?:\n|$)/],
  ['pnpm start', /(?:^|\n)pnpm start(?:\n|$)/],
  ['pnpm start:worker', /(?:^|\n)pnpm start:worker(?:\n|$)/],
  ['DATABASE_URL', /DATABASE_URL/],
  ['MEILI_INDEX_UID', /MEILI_INDEX_UID/],
  ['.env.test', /\.env\.test/],
  ['.env.production', /\.env\.production/],
  ['Meilisearch', /Meilisearch/],
  ['cmn', /cmn/],
  ['pnpm typecheck', /(?:^|\n)pnpm typecheck(?:\n|$)/],
  ['pnpm lint', /(?:^|\n)pnpm lint(?:\n|$)/],
  ['pnpm test', /(?:^|\n)pnpm test(?:\n|$)/],
  ['ghcr.io/ximing/tributary-server', /ghcr\.io\/ximing\/tributary-server/],
  ['docker-compose.prod.yml', /docker-compose\.prod\.yml/],
  ['https://fenzhi.aimo.plus', /https:\/\/fenzhi\.aimo\.plus/],
  ['13008', /13008/],
  ['.env.production.example', /\.env\.production\.example/],
  ['/root/apps/tributary', /\/root\/apps\/tributary/],
];
for (const [label, pattern] of docFacts) {
  if (!pattern.test(docs)) failures.push(`链出去的说明里缺少 ${label}`);
}

const banned = ['S3_SECRET', 'ssh root@', 'ssh -p', '39.96.159.212', '222.128.65.91', '192.168.9.109', '192.168.9.111'];
const tracked = [`README.md\n${readme}`, ...markdown.filter((item) => existsSync(item.abs)).map((item) => `${item.href}\n${readFileSync(item.abs, 'utf8')}`)];
for (const text of tracked) {
  for (const secret of banned) {
    if (text.includes(secret)) failures.push(`说明文件含有不应提交的内容: ${secret}`);
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(`readme check ok (${String(markdown.length)} markdown, ${String(images.length)} image)`);
