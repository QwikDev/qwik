/* eslint-disable no-console */
// Test script to verify all edit URLs are working
import https from 'https';

// Import the arrays from on-this-page.tsx (these are simplified copies for testing)
const QWIK_GROUP = [
  'components',
  'concepts',
  'faq',
  'getting-started',
  'index',
  'deprecated-features',
];

const QWIK_ADVANCED_GROUP = [
  'containers',
  'custom-build-dir',
  'dollar',
  'eslint',
  'library',
  'optimizer',
  'modules-prefetching',
  'qrl',
  'qwikloader',
  'vite',
];

const QWIKROUTER_GROUP = [
  'action',
  'api',
  'caching',
  'endpoints',
  'error-handling',
  'html-attributes',
  'layout',
  'middleware',
  'pages',
  'project-structure',
  'qwikrouter',
  're-exporting-loaders',
  'route-loader',
  'routing',
  'server$',
  'validator',
];

const QWIKROUTER_ADVANCED_GROUP = [
  'complex-forms',
  'content-security-policy',
  'menu',
  'plugins',
  'request-handling',
  'routing',
  'sitemaps',
  'speculative-module-fetching',
  'static-assets',
];

// Function to transform URL path (simplified version of makeEditPageUrl)
function makeEditPageUrl(url) {
  const segments = url.split('/').filter((part) => part !== '');
  if (segments[0] !== 'docs') {
    return url;
  }

  let group = '';
  if (segments.length === 1) {
    // Handle root /docs path - it maps to the qwik overview page
    return 'docs/(qwik)';
  }

  if (segments[1] === 'advanced') {
    if (QWIK_ADVANCED_GROUP.includes(segments[2])) {
      group = '(qwik)';
    } else if (QWIKROUTER_ADVANCED_GROUP.includes(segments[2])) {
      group = '(qwikrouter)';
    }
  } else if (QWIK_GROUP.includes(segments[1])) {
    group = '(qwik)';
  } else if (QWIKROUTER_GROUP.includes(segments[1])) {
    group = '(qwikrouter)';
  }

  if (group) {
    segments.splice(1, 0, group);
  }

  // Handle special cases for components and concepts which have a different structure
  if (segments.includes('components') || segments.includes('concepts')) {
    // Check if this is a subpage under components or concepts
    const componentIndex = segments.indexOf('components');
    const conceptIndex = segments.indexOf('concepts');
    const index = componentIndex !== -1 ? componentIndex : conceptIndex;

    // If there's a subpage (like components/overview or concepts/resumable)
    if (index !== -1 && index + 1 >= segments.length) {
      // These are directory paths without subpaths, map to their overview pages
      if (componentIndex !== -1) {
        return 'docs/(qwik)/components/overview';
      } else if (conceptIndex !== -1) {
        return 'docs/(qwik)/concepts/think-qwik';
      }
    }
  }

  return segments.join('/');
}

// Check if a URL exists
function checkUrl(url) {
  return new Promise((resolve) => {
    const options = {
      method: 'HEAD',
      host: 'github.com',
      path: url.replace('https://github.com', ''),
      timeout: 5000,
    };

    const req = https.request(options, (res) => {
      resolve({
        url,
        status: res.statusCode,
        ok: res.statusCode < 400,
      });
    });

    req.on('error', (err) => {
      resolve({
        url,
        status: 0,
        ok: false,
        error: err.message,
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        url,
        status: 0,
        ok: false,
        error: 'Timeout',
      });
    });

    req.end();
  });
}

// Generate paths for testing
async function testAllPaths() {
  console.log('Testing URL paths for documentation pages...');

  // Generate test paths
  const testPaths = [];

  // Test QWIK_GROUP paths
  for (const path of QWIK_GROUP) {
    if (path === 'index') {
      // Special case for index
      testPaths.push('/docs');
    } else {
      testPaths.push(`/docs/${path}`);
    }
  }

  // Test QWIK_ADVANCED_GROUP paths
  for (const path of QWIK_ADVANCED_GROUP) {
    testPaths.push(`/docs/advanced/${path}`);
  }

  // Test QWIKROUTER_GROUP paths
  for (const path of QWIKROUTER_GROUP) {
    testPaths.push(`/docs/${path}`);
  }

  // Test QWIKROUTER_ADVANCED_GROUP paths
  for (const path of QWIKROUTER_ADVANCED_GROUP) {
    testPaths.push(`/docs/advanced/${path}`);
  }

  // Test each path
  let failCount = 0;
  let successCount = 0;
  let failedPaths = [];

  console.log(`Testing ${testPaths.length} URLs...`);

  for (const testPath of testPaths) {
    const editPath = makeEditPageUrl(testPath);
    const editUrl = `https://github.com/QwikDev/qwik/blob/build/v2/packages/docs/src/routes/${editPath}/index.mdx`;

    try {
      const result = await checkUrl(editUrl);
      if (result.ok) {
        console.log(`✅ ${editUrl}`);
        successCount++;
      } else {
        console.error(`❌ ${editUrl} (Status: ${result.status})`);
        failCount++;
        failedPaths.push(testPath);
      }
    } catch (error) {
      console.error(`❌ Error checking ${editUrl}: ${error.message}`);
      failCount++;
      failedPaths.push(testPath);
    }
  }

  console.log(`\nTest complete: ${successCount} successful, ${failCount} failed`);
  if (failCount > 0) {
    console.log('\nFailed paths:');
    failedPaths.forEach((path) => {
      console.log(`- ${path}`);
    });
  }
}

// Run the tests
testAllPaths();
