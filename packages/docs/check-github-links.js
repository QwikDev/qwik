const fs = require('fs');
const path = require('path');
const https = require('https');

/**
 * Check all GitHub links in the docs to ensure they are valid. This script scans all .mdx and .md
 * files for GitHub links and verifies them.
 *
 * Usage: node check-github-links.js Exit code: 0 if all links are valid, 1 if any links are broken
 */

// Find all GitHub links in mdx and md files
function findGitHubLinks(dir) {
  const links = [];

  function walkDir(currentDir) {
    const items = fs.readdirSync(currentDir);
    for (const item of items) {
      const itemPath = path.join(currentDir, item);
      const stat = fs.statSync(itemPath);
      if (stat.isDirectory()) {
        walkDir(itemPath);
      } else if (item.endsWith('.mdx') || item.endsWith('.md')) {
        const content = fs.readFileSync(itemPath, 'utf8');
        const matches = content.match(/https:\/\/github\.com\/[^\s\)\"\>\]]+/g);
        if (matches) {
          for (const link of matches) {
            const cleanLink = link.replace(/[\.,;:!\?\'\"\>\)\]]+$/, '');
            links.push({ file: itemPath, link: cleanLink });
          }
        }
      }
    }
  }

  walkDir(dir);
  return links;
}

// Check if a URL is valid
function checkUrl(url) {
  return new Promise((resolve) => {
    const options = {
      method: 'HEAD',
      host: 'github.com',
      path: url.replace('https://github.com', ''),
      timeout: 10000,
      headers: {
        'User-Agent': 'qwik-docs-link-checker',
      },
    };

    const req = https.request(options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        resolve({ url, status: res.statusCode, ok: true, redirect: res.headers.location });
      } else if (res.statusCode === 429) {
        // Rate limited - mark as potentially ok since we can't verify
        resolve({ url, status: res.statusCode, ok: true, warning: 'Rate limited' });
      } else {
        resolve({ url, status: res.statusCode, ok: res.statusCode < 400 });
      }
    });

    req.on('error', (err) => {
      resolve({ url, status: 0, ok: false, error: err.message });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ url, status: 0, ok: false, error: 'Timeout' });
    });

    req.end();
  });
}

// Delay function
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Check links with rate limiting
async function checkLinksWithRateLimit(links, delayMs = 500) {
  const results = [];

  for (const link of links) {
    const result = await checkUrl(link);
    results.push(result);
    process.stdout.write(result.ok ? '.' : 'x');
    if (delayMs > 0) {
      await delay(delayMs);
    }
  }

  return results;
}

// Main function
async function main() {
  const links = findGitHubLinks('./src/routes');
  const uniqueLinks = [...new Set(links.map((l) => l.link))];

  console.log(`Found ${links.length} GitHub link occurrences (${uniqueLinks.length} unique links)`);
  console.log('Checking links (with rate limiting)...');

  const results = await checkLinksWithRateLimit(uniqueLinks, 500);

  const failed = results.filter((r) => !r.ok);
  const success = results.filter((r) => r.ok);

  console.log(`\n\nTest complete: ${success.length} successful, ${failed.length} failed`);

  if (failed.length > 0) {
    console.log('\nFailed links:');
    for (const result of failed) {
      console.log(`  ❌ ${result.url} (Status: ${result.status}, Error: ${result.error})`);
      const files = links.filter((l) => l.link === result.url).map((l) => l.file);
      console.log(`     Files: ${files.join(', ')}`);
    }
    process.exit(1);
  } else {
    console.log('\nAll links are valid! ✅');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
