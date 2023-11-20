/* eslint-disable no-console */

// The golden oldies
const keepList = new Set('1.0.0,1.1.5'.split(','));
// The bad apples
const blockList = new Set(
  '1.2.0,1.2.1,1.2.2,1.2.3,1.2.4,1.2.5,1.2.6,1.2.7,1.2.8,1.2.9,1.2.10,1.2.11,1.2.14,1.2.15,1.2.19'.split(
    ','
  )
);

export const getReplVersion = async (version: string | undefined) => {
  let versions: string[] = [];
  let npmData: NpmData | null = null;

  try {
    npmData = JSON.parse(localStorage.getItem(NPM_STORAGE_KEY)!);
    if (isExpiredNpmData(npmData)) {
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

  if (npmData && Array.isArray(npmData.versions)) {
    versions = npmData.versions.filter((v) => {
      if (keepList.has(v)) {
        // always include keepList, but we add them back later
        return false;
      }
      if (v === version) {
        return true;
      }
      if (npmData?.tags.latest === v) {
        // always include "latest"
        return true;
      }
      if (blockList.has(v)) {
        // always exclude blockList
        return false;
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

    if (versions.length > 20 - keepList.size) {
      versions = versions.slice(0, 20 - keepList.size);
    }
    versions.unshift(...keepList);
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

    if (!version || !npmData.versions.includes(version)) {
      version = npmData.tags.latest;
    }
  }

  if (!npmData) {
    console.debug(`Qwik REPL, npm data not found`);
  }

  if (!Array.isArray(versions) || versions.length === 0) {
    console.debug(`Qwik REPL, versions not found`);
  }

  if (!version) {
    console.debug(`Qwik REPL, version not found`);
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
