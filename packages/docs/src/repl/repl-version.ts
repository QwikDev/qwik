/* eslint-disable no-console */
import { QWIK_PKG_NAME, getBundled } from './bundled';

const bundledVersion = getBundled()[QWIK_PKG_NAME].version;

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
      console.debug(`Qwik REPL, fetch npm data: ${QWIK_NPM_DATA}`);
      const npmRsp = await fetch(QWIK_NPM_DATA);
      npmData = await npmRsp.json();
      npmData!.timestamp = Date.now();

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
    if (v.includes('-')) {
      // filter out dev builds
      return false;
    }
    const parts = v.split('.');
    if (parts.length !== 3) {
      // invalid, must have 3 parts
      return false;
    }
    if (isNaN(parts[2] as any)) {
      // last part cannot have letters in it
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

const QWIK_NPM_DATA = `https://data.jsdelivr.com/v1/package/npm/@builder.io/qwik`;

const NPM_STORAGE_KEY = `qwikNpmData`;

// https://data.jsdelivr.com/v1/package/npm/@builder.io/qwik
interface NpmData {
  tags: { latest: string; next: string };
  versions: string[];
  timestamp: number;
}
