/**
 * sync-content.mjs
 *
 * Obsidian → Astro 内容同步管线
 *
 * 用法:
 *   node scripts/sync-content.mjs                    # 列出所有可同步内容（dry-run）
 *   node scripts/sync-content.mjs --sync blog        # 同步某类内容
 *   node scripts/sync-content.mjs --sync all         # 同步所有内容
 *   node scripts/sync-content.mjs --sync blog --file "EXTI中断"  # 同步单篇
 *
 * 路径配置（通过环境变量或硬编码）:
 *   VAULT_PATH    Obsidian 知识库路径
 *   SITE_PATH     网站项目路径（默认当前项目根目录）
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, readdirSync, statSync } from 'fs';
import { join, dirname, extname, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITE_PATH = join(__dirname, '..');
const VAULT_PATH = process.env.VAULT_PATH || 'D:\\003_Study\\@Obsidian\\个人规划';

// ===== Content type definitions =====
const CONTENT_TYPES = {
  blog: {
    label: '诙谐科普 + 博客文章',
    sources: [
      { dir: join(VAULT_PATH, '8-技术笔记', '诙谐科普'), recursive: true, filter: (f) => f.endsWith('.md') },
      { dir: join(VAULT_PATH, '8-技术笔记', '博客输出'), recursive: false, filter: (f) => f.endsWith('.md'), status: '可发布' },
      { dir: join(VAULT_PATH, '8-技术笔记', '博客草稿'), recursive: false, filter: (f) => f.endsWith('.md'), status: '可发布' },
    ],
    target: join(SITE_PATH, 'src', 'content', 'blog'),
    layout: '../../layouts/BlogLayout.astro',
    slugPrefix: '',
  },
  notes: {
    label: 'STM32 技术笔记',
    sources: [
      { dir: join(VAULT_PATH, '8-技术笔记', 'STM32F4外设库'), recursive: true, filter: (f) => f.endsWith('.md') },
    ],
    target: join(SITE_PATH, 'src', 'content', 'notes'),
    layout: '../../layouts/DocLayout.astro',
    slugPrefix: 'notes/',
  },
  projects: {
    label: '项目文档',
    sources: [
      { dir: join(VAULT_PATH, '6-项目', 'EmbeddedLab'), recursive: true, filter: (f) => f.endsWith('.md') && !f.includes('开发日志') && !f.includes('Day') },
    ],
    target: join(SITE_PATH, 'src', 'content', 'projects'),
    layout: '../../layouts/ProjectLayout.astro',
    slugPrefix: 'projects/',
  },
  reading: {
    label: '读书笔记',
    sources: [
      { dir: join(VAULT_PATH, '5-领域', '阅读'), recursive: false, filter: (f) => /^\d{3}-.*\.md$/.test(f) },
    ],
    target: join(SITE_PATH, 'src', 'content', 'reading'),
    layout: '../../layouts/ReadingLayout.astro',
    slugPrefix: 'reading/',
  },
};

const CONTENT_COLLECTIONS = ['blog', 'notes', 'projects', 'reading'];

// ===== Slug generation =====
function toSlug(name) {
  let slug = basename(name, '.md');
  // Remove date suffix like -20260531
  slug = slug.replace(/-\d{8}$/, '');
  // Remove status/publish suffix
  slug = slug.replace(/-(发布版|可发布|草稿)$/, '');
  // If path has subdirectories, use full relative path for uniqueness
  const dirPart = dirname(name);
  if (dirPart && dirPart !== '.') {
    const dirSlug = dirPart.replace(/[\\/]/g, '-').replace(/^\d{2}_/, '');
    slug = dirSlug + '-' + slug;
  }
  // For subdirectory conten, use the subdir name as prefix
  slug = slug
    .toLowerCase()
    .replace(/\s+/g, '-')     // spaces → hyphens
    .replace(/[\\/]/g, '-')   // path separators → hyphens
    .replace(/[^\w一-鿿-]/g, '')  // keep Chinese chars, letters, numbers, hyphens
    .replace(/--+/g, '-')     // collapse multiple hyphens
    .replace(/^-+|-+$/g, ''); // trim hyphens
  // If slug is empty after processing, use a hash
  if (!slug) {
    let hash = 0;
    for (const c of name) { hash = ((hash << 5) - hash) + c.charCodeAt(0); hash |= 0; }
    slug = 'post-' + Math.abs(hash).toString(36);
  }
  return slug;
}

// ===== Frontmatter parsing =====
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return { frontmatter: {}, body: content };
  const fm = {};
  const lines = match[1].split('\n');
  let currentKey = null;
  for (const line of lines) {
    const kvMatch = line.match(/^(\w+):\s*(.*)$/);
    if (kvMatch) {
      currentKey = kvMatch[1];
      let val = kvMatch[2].trim();
      // Handle arrays: [item1, item2] or ["item1", "item2"]
      if (val.startsWith('[') && val.endsWith(']')) {
        val = val.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
      }
      fm[currentKey] = val;
    } else if (currentKey && line.startsWith('  ')) {
      // continuation (for arrays in some formats)
      const trimmed = line.trim().replace(/^-\s*/, '').replace(/^["']|["']$/g, '');
      if (trimmed) {
        if (!Array.isArray(fm[currentKey])) fm[currentKey] = [fm[currentKey]];
        fm[currentKey].push(trimmed);
      }
    }
  }
  const body = content.slice(match[0].length);
  return { frontmatter: fm, body };
}

// ===== WikiLink conversion =====
function convertWikiLinks(body, contentType) {
  // Convert ![[image.png]] to markdown image
  body = body.replace(/!\[\[([^\]]+\.(png|jpg|jpeg|gif|svg|webp))\]\]/gi, (_, img) => {
    return `![${img}](/images/${img})`;
  });
  // Convert [[link|display]] to markdown link
  body = body.replace(/\[\[([^\]]+)\|([^\]]+)\]\]/g, (_, link, display) => {
    const slug = toSlug(link);
    return `[${display}](/${contentType}/${slug})`;
  });
  // Convert [[link]] to markdown link
  body = body.replace(/\[\[([^\]]+)\]\]/g, (_, link) => {
    const slug = toSlug(link);
    return `[${link}](/${contentType}/${slug})`;
  });
  return body;
}

// ===== Image handling =====
function handleImages(body, sourceDir, imagesDir) {
  // Copy images from wikinlinks ![[img.png]]
  const wikiMatches = body.matchAll(/!\[\[([^\]]+\.(png|jpg|jpeg|gif|svg|webp))\]\]/gi);
  for (const match of wikiMatches) {
    const imgFile = match[1];
    // Search in vault asset dir, then next to source file
    const possiblePaths = [
      join(VAULT_PATH, 'asset', imgFile),
      join(VAULT_PATH, 'asset', 'images', imgFile),
      join(sourceDir, imgFile),
    ];
    for (const srcPath of possiblePaths) {
      if (existsSync(srcPath)) {
        if (!existsSync(imagesDir)) mkdirSync(imagesDir, { recursive: true });
        copyFileSync(srcPath, join(imagesDir, imgFile));
        break;
      }
    }
  }
  return body;
}

// ===== Dataview block removal =====
function removeDataviewBlocks(body) {
  return body.replace(/```dataview[\s\S]*?```/g, '');
}

// ===== Scan candidate files =====
function scanCandidates() {
  const candidates = {};
  for (const [type, config] of Object.entries(CONTENT_TYPES)) {
    candidates[type] = [];
    for (const source of config.sources) {
      if (!existsSync(source.dir)) continue;
      const files = listFiles(source.dir, source.recursive);
      for (const file of files) {
        if (!source.filter(file)) continue;
        try {
          const fullPath = join(source.dir, file);
          const content = readFileSync(fullPath, 'utf-8');
          const { frontmatter } = parseFrontmatter(content);
          candidates[type].push({
            path: fullPath,
            relPath: file,
            frontmatter,
            slug: toSlug(file),
          });
        } catch (err) {
          console.error(`  ⚠️  读取失败: ${file} — ${err.message}`);
        }
      }
    }
  }
  return candidates;
}

function listFiles(dir, recursive) {
  const results = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    const rel = entry.name;
    if (entry.isDirectory() && recursive) {
      const sub = listFiles(full, true);
      results.push(...sub.map(f => join(entry.name, f)));
    } else if (entry.isFile()) {
      results.push(rel);
    }
  }
  return results;
}

// ===== Main =====
async function main() {
  const args = process.argv.slice(2);
  const syncType = args.includes('--sync') ? args[args.indexOf('--sync') + 1] : null;
  const syncFile = args.includes('--file') ? args[args.indexOf('--file') + 1] : null;

  console.log('\n🔍 内容扫描中...\n');
  console.log(`📂 知识库: ${VAULT_PATH}`);
  console.log(`🌐 网站项目: ${SITE_PATH}\n`);

  const candidates = scanCandidates();

  if (!syncType) {
    // Dry-run: show all candidates
    console.log('📋 可同步内容概览（dry-run）:\n');
    for (const [type, items] of Object.entries(candidates)) {
      console.log(`  ${type.toUpperCase()} (${CONTENT_TYPES[type].label}): ${items.length} 篇`);
      for (const item of items) {
        const tags = item.frontmatter.tags ? (Array.isArray(item.frontmatter.tags) ? item.frontmatter.tags.join(', ') : item.frontmatter.tags) : '';
        const status = item.frontmatter.status || '';
        const indicators = [status, tags].filter(Boolean).join(' · ');
        console.log(`    → ${item.slug}${indicators ? `  [${indicators}]` : ''}`);
      }
      console.log('');
    }
    console.log('💡 使用 --sync <type> 同步内容（blog / notes / projects / reading）');
    console.log('💡 使用 --sync all 同步所有内容');
    console.log('💡 使用 --sync blog --file "关键词" 同步单篇文章\n');
    return;
  }

  // Filter what to sync
  const typesToSync = syncType === 'all' ? CONTENT_COLLECTIONS : [syncType];
  if (!CONTENT_COLLECTIONS.includes(syncType) && syncType !== 'all') {
    console.error(`❌ 未知内容类型: ${syncType}。可用: ${CONTENT_COLLECTIONS.join(', ')} 或 all`);
    process.exit(1);
  }

  console.log(`\n🚀 开始同步内容...\n`);

  for (const type of typesToSync) {
    const config = CONTENT_TYPES[type];
    let items = candidates[type];

    if (syncFile) {
      items = items.filter(item =>
        item.slug.includes(syncFile) || item.relPath.includes(syncFile)
      );
    }

    if (items.length === 0) {
      console.log(`  ${type}: 没有匹配的内容`);
      continue;
    }

    // Create target directory
    const targetDir = config.target;
    if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true });

    const imagesDir = join(SITE_PATH, 'public', 'images');
    if (!existsSync(imagesDir)) mkdirSync(imagesDir, { recursive: true });

    let synced = 0;
    for (const item of items) {
      const content = readFileSync(item.path, 'utf-8');
      let { frontmatter, body } = parseFrontmatter(content);

      // Filter by status if specified
      if (config.sources[0]?.status && frontmatter.status !== config.sources[0].status) {
        continue;
      }

      // Build new frontmatter
      const newFm = {
        title: frontmatter.title || basename(item.path, '.md'),
        pubDate: frontmatter.date || frontmatter.pubDate || new Date().toISOString().split('T')[0],
        tags: Array.isArray(frontmatter.tags) ? frontmatter.tags : (frontmatter.tags ? [frontmatter.tags] : []),
        draft: false,
        layout: config.layout,
        description: frontmatter.description || frontmatter.summary || '',
      };

      // Clean body
      body = removeDataviewBlocks(body);
      body = convertWikiLinks(body, type);
      body = handleImages(body, dirname(item.path), imagesDir);

      // Write file
      const newPath = join(targetDir, `${item.slug}.md`);
      let newContent = '---\n';
      for (const [key, val] of Object.entries(newFm)) {
        if (Array.isArray(val)) {
          newContent += `${key}: [${val.map(v => `"${v}"`).join(', ')}]\n`;
        } else if (typeof val === 'boolean') {
          newContent += `${key}: ${val}\n`;
        } else if (typeof val === 'string' && (val.includes(':') || val.includes('#'))) {
          newContent += `${key}: "${val}"\n`;
        } else {
          newContent += `${key}: ${val}\n`;
        }
      }
      newContent += '---\n\n';
      newContent += body.trim();
      newContent += '\n';

      writeFileSync(newPath, newContent, 'utf-8');
      synced++;
      console.log(`  ✓ ${type}/${item.slug}.md`);
    }
    console.log(`  → ${type}: 已同步 ${synced}/${items.length} 篇\n`);
  }

  console.log('✅ 同步完成！运行 npm run build 重新构建网站\n');
}

main().catch(console.error);
