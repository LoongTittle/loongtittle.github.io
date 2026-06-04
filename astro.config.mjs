// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import wikiLink from 'remark-wiki-link';
import obsidianCallout from 'rehype-obsidian-callout';

// https://astro.build/config
export default defineConfig({
  site: 'https://loongtittle.github.io',
  output: 'static',
  integrations: [mdx(), sitemap()],
  markdown: {
    shikiConfig: {
      theme: 'github-light',
      wrap: true,
    },
  },
  build: {
    assets: '_assets',
  },
});
