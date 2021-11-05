const { join } = require('path');
const { mkdirSync, readdirSync, renameSync, writeFileSync } = require('fs');
const { platformArchTriples } = require('@napi-rs/triples');

function binaryRelease() {
  console.log('🦊 Binary Release');

  const napiDir = join(__dirname, '..', '..', '..', 'src', 'optimizer', 'napi');

  const dirFiles: string[] = readdirSync(napiDir);

  const platformFiles = dirFiles.filter((f) => f.endsWith('.node'));

  platformFiles.forEach((platformFileName) => {
    createPlatformOptimizerRelease(napiDir, platformFileName);
  });
}

function createPlatformOptimizerRelease(napiDir: string, platformFileName: string) {
  // platformFileName: qwik.darwin-arm64.node
  // platformArchABI: darwin-arm64
  // packageName: @builder.io/qwik-darwin-arm64

  const libraryFileName = `qwik`;
  const platformArchABIName = platformFileName
    .replace(libraryFileName + '.', '')
    .replace('.node', '');
  const packageName = `@builder.io/qwik-${platformArchABIName}`;

  console.log(`Create ${packageName}`);

  const p = getPlatformArchABI(platformArchABIName);

  const pkgJson = {
    name: packageName,
    verion: '0.0.0',
    os: [p.platform],
    cpu: [p.arch],
    main: platformFileName,
    files: [platformFileName],
    license: 'MIT',
    engines: {
      node: '>= 16',
    },
  };

  const pkgDir = join(napiDir, 'package-' + platformArchABIName);
  const pkgJsonPath = join(pkgDir, 'package.json');
  const pkgReadmePath = join(pkgDir, 'README.md');
  mkdir(pkgDir);

  writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2));
  writeFileSync(pkgReadmePath, createReadme(packageName, p.raw));

  const srcBinary = join(napiDir, platformFileName);
  const destBinary = join(pkgDir, platformFileName);
  renameSync(srcBinary, destBinary);
}

function createReadme(packageName: string, raw: string) {
  return `# \`${packageName}\`\n\n**${raw}** binary for \`@builder.io/qwik\`\n`;
}

function getPlatformArchABI(platformArchABI: string) {
  for (const platformName in platformArchTriples) {
    const platform = platformArchTriples[platformName];
    for (const archName in platform) {
      for (const a of platform[archName]) {
        if (a.platformArchABI === platformArchABI) {
          return a;
        }
      }
    }
  }
  throw new Error(`Didnt find platformArchABI: ${platformArchABI}`);
}

function mkdir(dir: string) {
  try {
    mkdirSync(dir);
  } catch (e) {}
}

binaryRelease();
