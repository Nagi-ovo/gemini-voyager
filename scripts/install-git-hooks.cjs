#!/usr/bin/env node

const { execFileSync } = require('node:child_process');

try {
  execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { stdio: 'ignore' });
  execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { stdio: 'ignore' });
  console.log('Git hooks installed: core.hooksPath=.githooks');
} catch {
  // Package installs can happen outside a git checkout. Keep install non-blocking.
}
