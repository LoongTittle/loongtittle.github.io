import content from './site-content.json';

export const peripheralControl = {
  ...content.project,
  href: '/projects/embedded-linux-peripheral-control/',
  source: 'https://github.com/LoongTittle/embedded-linux-peripheral-control',
  stack: content.project.stack.split('\n').filter(Boolean),
};
