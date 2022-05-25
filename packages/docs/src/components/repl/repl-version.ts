export const getReplVersion = async (version: string | undefined) => {
  let versions: string[] = [];
  let npmData: NpmData | null = null;

  try {
    npmData = JSON.parse(localStorage.getItem(NPM_STORAGE_KEY)!);
    if (isExpiredNpmData(npmData)) {
      // fetch most recent NPM version data
      const npmRsp = await fetch(QWIK_NPM_DATA);
      npmData = await npmRsp.json();
      npmData!.timestamp = Date.now();

      localStorage.setItem(NPM_STORAGE_KEY, JSON.stringify(npmData));
    }
  } catch (e) {
    console.warn(e);
  }

  if (npmData && Array.isArray(npmData.versions)) {
    versions = npmData.versions.filter((v) => {
      if (v === version) {
        return true;
      }
      if (npmData?.tags.latest === v || npmData?.tags.next === v) {
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
        // last part must have letters in it
        return false;
      }
      // mini-semver check, must be >= than 0.0.20
      if (parts[0] === '0' && parts[1] === '0') {
        if (parseInt(parts[2], 10) < 20) {
          return false;
        }
      }
      return true;
    });

    if (!version || !versions.includes(version)) {
      if (versions.includes(npmData.tags.latest)) {
        // if we haven't filtered it out, default to "latest"
        version = npmData.tags.latest;
      } else if (versions.includes(npmData.tags.next)) {
        // fallback to "next" if "latset" isn't valid
        version = npmData.tags.next;
      }
    }
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
