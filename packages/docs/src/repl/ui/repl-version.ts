import { bundled } from '../bundler/bundled';
import { QWIK_PKG_NAME_V1 } from '../repl-constants';

const bundledVersion = bundled[QWIK_PKG_NAME_V1].version;

// The golden oldies
const keepList = new Set('1.0.0,1.1.5,1.2.13,1.4.5'.split(','));

// The bad apples - add versions that break the REPL here
const blockList = new Set(
  '1.2.0,1.2.1,1.2.2,1.2.3,1.2.4,1.2.5,1.2.6,1.2.7,1.2.8,1.2.9,1.2.10,1.2.11,1.2.14,1.2.15,1.3.0,1.6.0'.split(
    ','
  )
);

export const getReplVersion = async (version: string | undefined, offline: boolean) => {
  let npmData: NpmData | null = null;

  try {
    npmData = JSON.parse(localStorage.getItem(NPM_STORAGE_KEY)!);
    if (!offline && isExpiredNpmData(npmData)) {
      // fetch most recent NPM version data
      console.debug(`Qwik REPL, fetch npm data: ${QWIK_NPM_V1_DATA}`);
      const npmData = await fetch(QWIK_NPM_V1_DATA).then((r) => r.json());
      npmData.timestamp = Date.now();
      const v2Data = await fetch(QWIK_NPM_V2_DATA).then((r) => r.json());
      npmData.versions.unshift(...v2Data.versions);
      localStorage.setItem(NPM_STORAGE_KEY, JSON.stringify(npmData));
    } else {
      console.debug(`Qwik REPL, using cached npm data`);
    }
  } catch (e) {
    console.warn('getReplVersion', e);
  }
  const npmVersions = npmData?.versions || [];

  let hasVersion = false;
  let versions = npmVersions.filter((v) => {
    if (keepList.has(v) || v === bundledVersion) {
      // always include keepList, but we add them back later
      return false;
    }
    if (v === version) {
      hasVersion = true;
      return true;
    }
    if (blockList.has(v)) {
      // always exclude blockList
      return false;
    }
    if (npmData?.tags.latest === v) {
      // always include "latest"
      return true;
    }
    const parts = v.split('.');
    if (!parts[2] || /-(dev|alpha)/.test(parts[2])) {
      // exclude dev and alpha versions
      return false;
    }
    // mini-semver check, must be >= than 0.0.100
    if (parts[0] === '0' && parts[1] === '0') {
      if (parseInt(parts[2], 10) < 100) {
        return false;
      }
    }
    return true;
  });
  if (versions.length > 19 - keepList.size) {
    versions = versions.slice(0, 19 - keepList.size);
  }
  versions.unshift(...keepList);
  if (hasVersion && !versions.includes(version!)) {
    versions.push(version!);
  }
  // sort by version number
  versions.sort((a, b) => {
    const aParts = a.split('.');
    const bParts = b.split('.');
    for (let i = 0; i < 3; i++) {
      const aNum = parseInt(aParts[i], 10);
      const bNum = parseInt(bParts[i], 10);
      if (aNum > bNum) {
        return -1;
      }
      if (aNum < bNum) {
        return 1;
      }
    }
    return 0;
  });

  versions.unshift('bundled');
  if (!hasVersion || !version) {
    version = 'bundled';
  }

  return { version, versions };
};

const isExpiredNpmData = (npmData: NpmData | null) => {
  if (npmData && typeof npmData.timestamp === 'number') {
    if (npmData.timestamp + 1000 * 60 * 60 * 2 > Date.now()) {
      return false;
    }
  }
  return true;
};

const QWIK_NPM_V1_DATA = `https://data.jsdelivr.com/v1/package/npm/@builder.io/qwik`;
const QWIK_NPM_V2_DATA = `https://data.jsdelivr.com/v1/package/npm/@qwik.dev/core`;

const NPM_STORAGE_KEY = `qwikNpmData`;

interface NpmData {
  tags: { latest: string; next: string };
  versions: string[];
  timestamp: number;
}
