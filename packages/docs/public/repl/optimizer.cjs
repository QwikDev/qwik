/**
 * @license
 * @builder.io/qwik/optimizer
 * Copyright Builder.io, Inc. All Rights Reserved.
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */
if ("undefined" == typeof globalThis) {
  const g = "undefined" != typeof global ? global : "undefined" != typeof window ? window : "undefined" != typeof self ? self : {};
  g.globalThis = g;
}

globalThis.qwikOptimizer = function(module) {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getOwnPropSymbols = Object.getOwnPropertySymbols;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __propIsEnum = Object.prototype.propertyIsEnumerable;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, {
    enumerable: true,
    configurable: true,
    writable: true,
    value: value
  }) : obj[key] = value;
  var __spreadValues = (a, b) => {
    for (var prop in b || (b = {})) {
      __hasOwnProp.call(b, prop) && __defNormalProp(a, prop, b[prop]);
    }
    if (__getOwnPropSymbols) {
      for (var prop of __getOwnPropSymbols(b)) {
        __propIsEnum.call(b, prop) && __defNormalProp(a, prop, b[prop]);
      }
    }
    return a;
  };
  var __export = (target, all) => {
    for (var name in all) {
      __defProp(target, name, {
        get: all[name],
        enumerable: true
      });
    }
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && "object" === typeof from || "function" === typeof from) {
      for (let key of __getOwnPropNames(from)) {
        __hasOwnProp.call(to, key) || key === except || __defProp(to, key, {
          get: () => from[key],
          enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
        });
      }
    }
    return to;
  };
  var __toCommonJS = mod => __copyProps(__defProp({}, "__esModule", {
    value: true
  }), mod);
  var src_exports = {};
  __export(src_exports, {
    createOptimizer: () => createOptimizer,
    qwikRollup: () => qwikRollup,
    qwikVite: () => qwikVite,
    versions: () => versions
  });
  module.exports = __toCommonJS(src_exports);
  var qDev = false !== globalThis.qDev;
  globalThis.describe;
  var STYLE = qDev ? "background: #564CE0; color: white; padding: 2px 3px; border-radius: 2px; font-size: 0.8em;" : "";
  var logWarn = (message, ...optionalParams) => {
    console.warn("%cQWIK WARN", STYLE, message, ...optionalParams);
  };
  function createPath(opts = {}) {
    function assertPath(path) {
      if ("string" !== typeof path) {
        throw new TypeError("Path must be a string. Received " + JSON.stringify(path));
      }
    }
    function normalizeStringPosix(path, allowAboveRoot) {
      let res = "";
      let lastSegmentLength = 0;
      let lastSlash = -1;
      let dots = 0;
      let code;
      for (let i = 0; i <= path.length; ++i) {
        if (i < path.length) {
          code = path.charCodeAt(i);
        } else {
          if (47 === code) {
            break;
          }
          code = 47;
        }
        if (47 === code) {
          if (lastSlash === i - 1 || 1 === dots) {} else if (lastSlash !== i - 1 && 2 === dots) {
            if (res.length < 2 || 2 !== lastSegmentLength || 46 !== res.charCodeAt(res.length - 1) || 46 !== res.charCodeAt(res.length - 2)) {
              if (res.length > 2) {
                const lastSlashIndex = res.lastIndexOf("/");
                if (lastSlashIndex !== res.length - 1) {
                  if (-1 === lastSlashIndex) {
                    res = "";
                    lastSegmentLength = 0;
                  } else {
                    res = res.slice(0, lastSlashIndex);
                    lastSegmentLength = res.length - 1 - res.lastIndexOf("/");
                  }
                  lastSlash = i;
                  dots = 0;
                  continue;
                }
              } else if (2 === res.length || 1 === res.length) {
                res = "";
                lastSegmentLength = 0;
                lastSlash = i;
                dots = 0;
                continue;
              }
            }
            if (allowAboveRoot) {
              res.length > 0 ? res += "/.." : res = "..";
              lastSegmentLength = 2;
            }
          } else {
            res.length > 0 ? res += "/" + path.slice(lastSlash + 1, i) : res = path.slice(lastSlash + 1, i);
            lastSegmentLength = i - lastSlash - 1;
          }
          lastSlash = i;
          dots = 0;
        } else {
          46 === code && -1 !== dots ? ++dots : dots = -1;
        }
      }
      return res;
    }
    function _format(sep2, pathObject) {
      const dir = pathObject.dir || pathObject.root;
      const base = pathObject.base || (pathObject.name || "") + (pathObject.ext || "");
      if (!dir) {
        return base;
      }
      if (dir === pathObject.root) {
        return dir + base;
      }
      return dir + sep2 + base;
    }
    const resolve = function(...paths) {
      let resolvedPath = "";
      let resolvedAbsolute = false;
      let cwd;
      for (let i = paths.length - 1; i >= -1 && !resolvedAbsolute; i--) {
        let path;
        if (i >= 0) {
          path = paths[i];
        } else {
          void 0 === cwd && (cwd = "undefined" !== typeof process && "function" === typeof process.cwd ? process.cwd() : "/");
          path = cwd;
        }
        assertPath(path);
        if (0 === path.length) {
          continue;
        }
        resolvedPath = path + "/" + resolvedPath;
        resolvedAbsolute = 47 === path.charCodeAt(0);
      }
      resolvedPath = normalizeStringPosix(resolvedPath, !resolvedAbsolute);
      return resolvedAbsolute ? resolvedPath.length > 0 ? "/" + resolvedPath : "/" : resolvedPath.length > 0 ? resolvedPath : ".";
    };
    const normalize = function(path) {
      assertPath(path);
      if (0 === path.length) {
        return ".";
      }
      const isAbsolute2 = 47 === path.charCodeAt(0);
      const trailingSeparator = 47 === path.charCodeAt(path.length - 1);
      path = normalizeStringPosix(path, !isAbsolute2);
      0 !== path.length || isAbsolute2 || (path = ".");
      path.length > 0 && trailingSeparator && (path += "/");
      if (isAbsolute2) {
        return "/" + path;
      }
      return path;
    };
    const isAbsolute = function(path) {
      assertPath(path);
      return path.length > 0 && 47 === path.charCodeAt(0);
    };
    const join = function(...paths) {
      if (0 === paths.length) {
        return ".";
      }
      let joined;
      for (let i = 0; i < paths.length; ++i) {
        const arg = paths[i];
        assertPath(arg);
        arg.length > 0 && (void 0 === joined ? joined = arg : joined += "/" + arg);
      }
      if (void 0 === joined) {
        return ".";
      }
      return normalize(joined);
    };
    const relative = function(from, to) {
      assertPath(from);
      assertPath(to);
      if (from === to) {
        return "";
      }
      from = resolve(from);
      to = resolve(to);
      if (from === to) {
        return "";
      }
      let fromStart = 1;
      for (;fromStart < from.length; ++fromStart) {
        if (47 !== from.charCodeAt(fromStart)) {
          break;
        }
      }
      const fromEnd = from.length;
      const fromLen = fromEnd - fromStart;
      let toStart = 1;
      for (;toStart < to.length; ++toStart) {
        if (47 !== to.charCodeAt(toStart)) {
          break;
        }
      }
      const toEnd = to.length;
      const toLen = toEnd - toStart;
      const length = fromLen < toLen ? fromLen : toLen;
      let lastCommonSep = -1;
      let i = 0;
      for (;i <= length; ++i) {
        if (i === length) {
          if (toLen > length) {
            if (47 === to.charCodeAt(toStart + i)) {
              return to.slice(toStart + i + 1);
            }
            if (0 === i) {
              return to.slice(toStart + i);
            }
          } else {
            fromLen > length && (47 === from.charCodeAt(fromStart + i) ? lastCommonSep = i : 0 === i && (lastCommonSep = 0));
          }
          break;
        }
        const fromCode = from.charCodeAt(fromStart + i);
        const toCode = to.charCodeAt(toStart + i);
        if (fromCode !== toCode) {
          break;
        }
        47 === fromCode && (lastCommonSep = i);
      }
      let out = "";
      for (i = fromStart + lastCommonSep + 1; i <= fromEnd; ++i) {
        i !== fromEnd && 47 !== from.charCodeAt(i) || (0 === out.length ? out += ".." : out += "/..");
      }
      if (out.length > 0) {
        return out + to.slice(toStart + lastCommonSep);
      }
      toStart += lastCommonSep;
      47 === to.charCodeAt(toStart) && ++toStart;
      return to.slice(toStart);
    };
    const dirname = function(path) {
      assertPath(path);
      if (0 === path.length) {
        return ".";
      }
      let code = path.charCodeAt(0);
      const hasRoot = 47 === code;
      let end = -1;
      let matchedSlash = true;
      for (let i = path.length - 1; i >= 1; --i) {
        code = path.charCodeAt(i);
        if (47 === code) {
          if (!matchedSlash) {
            end = i;
            break;
          }
        } else {
          matchedSlash = false;
        }
      }
      if (-1 === end) {
        return hasRoot ? "/" : ".";
      }
      if (hasRoot && 1 === end) {
        return "//";
      }
      return path.slice(0, end);
    };
    const basename = function(path, ext) {
      if (void 0 !== ext && "string" !== typeof ext) {
        throw new TypeError('"ext" argument must be a string');
      }
      assertPath(path);
      let start = 0;
      let end = -1;
      let matchedSlash = true;
      let i;
      if (void 0 !== ext && ext.length > 0 && ext.length <= path.length) {
        if (ext.length === path.length && ext === path) {
          return "";
        }
        let extIdx = ext.length - 1;
        let firstNonSlashEnd = -1;
        for (i = path.length - 1; i >= 0; --i) {
          const code = path.charCodeAt(i);
          if (47 === code) {
            if (!matchedSlash) {
              start = i + 1;
              break;
            }
          } else {
            if (-1 === firstNonSlashEnd) {
              matchedSlash = false;
              firstNonSlashEnd = i + 1;
            }
            if (extIdx >= 0) {
              if (code === ext.charCodeAt(extIdx)) {
                -1 === --extIdx && (end = i);
              } else {
                extIdx = -1;
                end = firstNonSlashEnd;
              }
            }
          }
        }
        start === end ? end = firstNonSlashEnd : -1 === end && (end = path.length);
        return path.slice(start, end);
      }
      for (i = path.length - 1; i >= 0; --i) {
        if (47 === path.charCodeAt(i)) {
          if (!matchedSlash) {
            start = i + 1;
            break;
          }
        } else if (-1 === end) {
          matchedSlash = false;
          end = i + 1;
        }
      }
      if (-1 === end) {
        return "";
      }
      return path.slice(start, end);
    };
    const extname = function(path) {
      assertPath(path);
      let startDot = -1;
      let startPart = 0;
      let end = -1;
      let matchedSlash = true;
      let preDotState = 0;
      for (let i = path.length - 1; i >= 0; --i) {
        const code = path.charCodeAt(i);
        if (47 === code) {
          if (!matchedSlash) {
            startPart = i + 1;
            break;
          }
          continue;
        }
        if (-1 === end) {
          matchedSlash = false;
          end = i + 1;
        }
        46 === code ? -1 === startDot ? startDot = i : 1 !== preDotState && (preDotState = 1) : -1 !== startDot && (preDotState = -1);
      }
      if (-1 === startDot || -1 === end || 0 === preDotState || 1 === preDotState && startDot === end - 1 && startDot === startPart + 1) {
        return "";
      }
      return path.slice(startDot, end);
    };
    const format = function(pathObject) {
      if (null === pathObject || "object" !== typeof pathObject) {
        throw new TypeError('The "pathObject" argument must be of type Object. Received type ' + typeof pathObject);
      }
      return _format("/", pathObject);
    };
    const parse = function(path) {
      assertPath(path);
      const ret = {
        root: "",
        dir: "",
        base: "",
        ext: "",
        name: ""
      };
      if (0 === path.length) {
        return ret;
      }
      let code = path.charCodeAt(0);
      let start;
      const isAbsolute2 = 47 === code;
      if (isAbsolute2) {
        ret.root = "/";
        start = 1;
      } else {
        start = 0;
      }
      let startDot = -1;
      let startPart = 0;
      let end = -1;
      let matchedSlash = true;
      let i = path.length - 1;
      let preDotState = 0;
      for (;i >= start; --i) {
        code = path.charCodeAt(i);
        if (47 === code) {
          if (!matchedSlash) {
            startPart = i + 1;
            break;
          }
          continue;
        }
        if (-1 === end) {
          matchedSlash = false;
          end = i + 1;
        }
        46 === code ? -1 === startDot ? startDot = i : 1 !== preDotState && (preDotState = 1) : -1 !== startDot && (preDotState = -1);
      }
      if (-1 === startDot || -1 === end || 0 === preDotState || 1 === preDotState && startDot === end - 1 && startDot === startPart + 1) {
        -1 !== end && (ret.base = ret.name = 0 === startPart && isAbsolute2 ? path.slice(1, end) : path.slice(startPart, end));
      } else {
        if (0 === startPart && isAbsolute2) {
          ret.name = path.slice(1, startDot);
          ret.base = path.slice(1, end);
        } else {
          ret.name = path.slice(startPart, startDot);
          ret.base = path.slice(startPart, end);
        }
        ret.ext = path.slice(startDot, end);
      }
      startPart > 0 ? ret.dir = path.slice(0, startPart - 1) : isAbsolute2 && (ret.dir = "/");
      return ret;
    };
    const sep = "/";
    const delimiter = ":";
    return {
      relative: relative,
      resolve: resolve,
      parse: parse,
      format: format,
      join: join,
      isAbsolute: isAbsolute,
      basename: basename,
      normalize: normalize,
      dirname: dirname,
      extname: extname,
      delimiter: delimiter,
      sep: sep,
      win32: null,
      posix: {
        relative: relative,
        resolve: resolve,
        parse: parse,
        format: format,
        join: join,
        isAbsolute: isAbsolute,
        basename: basename,
        normalize: normalize,
        dirname: dirname,
        extname: extname,
        delimiter: delimiter,
        sep: sep,
        win32: null,
        posix: null
      }
    };
  }
  var QWIK_BINDING_MAP = {
    darwin: {
      arm64: [ {
        platform: "darwin",
        arch: "arm64",
        abi: null,
        platformArchABI: "qwik.darwin-arm64.node"
      } ],
      x64: [ {
        platform: "darwin",
        arch: "x64",
        abi: null,
        platformArchABI: "qwik.darwin-x64.node"
      } ]
    },
    win32: {
      x64: [ {
        platform: "win32",
        arch: "x64",
        abi: "msvc",
        platformArchABI: "qwik.win32-x64-msvc.node"
      } ]
    }
  };
  var versions = {
    qwik: "0.0.19-0"
  };
  async function getSystem() {
    const sys = {
      dynamicImport: path => {
        throw new Error(`Qwik Optimizer sys.dynamicImport() not implemented, trying to import: "${path}"`);
      },
      path: null,
      cwd: () => "/",
      env: env
    };
    const sysEnv = env();
    sys.path = createPath(sys);
    false;
    if ("node" === sysEnv) {
      sys.dynamicImport = path => require(path);
      if ("undefined" === typeof TextEncoder) {
        const nodeUtil = sys.dynamicImport("util");
        global.TextEncoder = nodeUtil.TextEncoder;
        global.TextDecoder = nodeUtil.TextDecoder;
      }
    } else {
      "webworker" !== sysEnv && "browsermain" !== sysEnv || (sys.dynamicImport = async path => {
        const cjsRsp = await fetch(path);
        const cjsCode = await cjsRsp.text();
        const cjsModule = {
          exports: {}
        };
        const cjsRun = new Function("module", "exports", cjsCode);
        cjsRun(cjsModule, cjsModule.exports);
        return cjsModule.exports;
      });
    }
    if ("node" === sysEnv) {
      sys.path = await sys.dynamicImport("path");
      sys.cwd = () => process.cwd();
    }
    return sys;
  }
  var getPlatformInputFiles = async sys => {
    if ("function" === typeof sys.getInputFiles) {
      return sys.getInputFiles;
    }
    if ("node" === sys.env()) {
      const fs = await sys.dynamicImport("fs");
      return async rootDir => {
        const getChildFilePaths = async dir => {
          const dirItems = await fs.promises.readdir(dir);
          const files = await Promise.all(dirItems.map((async subdir => {
            const resolvedPath = sys.path.resolve(dir, subdir);
            const stats = await fs.promises.stat(resolvedPath);
            return stats.isDirectory() ? getChildFilePaths(resolvedPath) : [ resolvedPath ];
          })));
          const flatted = [];
          for (const file of files) {
            flatted.push(...file);
          }
          return flatted.filter((a => extensions[sys.path.extname(a)]));
        };
        const filePaths = await getChildFilePaths(rootDir);
        const inputs = (await Promise.all(filePaths.map((async filePath => {
          const input = {
            code: await fs.promises.readFile(filePath, "utf8"),
            path: filePath.slice(rootDir.length + 1)
          };
          return input;
        })))).sort(((a, b) => {
          if (a.path < b.path) {
            return -1;
          }
          if (a.path > b.path) {
            return 1;
          }
          return 0;
        }));
        return inputs;
      };
    }
    return null;
  };
  async function loadPlatformBinding(sys) {
    const sysEnv = env();
    if ("node" === sysEnv) {
      const platform = QWIK_BINDING_MAP[process.platform];
      if (platform) {
        const triples = platform[process.arch];
        if (triples) {
          for (const triple of triples) {
            try {
              const platformBindingPath = sys.path.join("bindings", triple.platformArchABI);
              const mod = await sys.dynamicImport("./" + platformBindingPath);
              return mod;
            } catch (e) {
              logWarn(e);
            }
          }
        }
      }
    }
    if ("node" === sysEnv) {
      const cjsWasmPath = sys.path.join("bindings", "qwik.wasm.cjs");
      const wasmPath = sys.path.join(__dirname, "bindings", "qwik_wasm_bg.wasm");
      const mod = await sys.dynamicImport("./" + cjsWasmPath);
      const fs = await sys.dynamicImport("fs");
      return new Promise(((resolve, reject) => {
        fs.readFile(wasmPath, ((err, buf) => {
          null != err ? reject(err) : resolve(buf);
        }));
      })).then((buf => WebAssembly.compile(buf))).then((wasm => mod.default(wasm))).then((() => mod));
    }
    if ("webworker" === sysEnv || "browsermain" === sysEnv) {
      const cdnUrl = `https://cdn.jsdelivr.net/npm/@builder.io/qwik@${versions.qwik}/bindings/`;
      const cjsModuleUrl = new URL("./qwik.wasm.cjs", cdnUrl).href;
      const wasmUrl = new URL("./qwik_wasm_bg.wasm", cdnUrl).href;
      const rsps = await Promise.all([ fetch(cjsModuleUrl), fetch(wasmUrl) ]);
      for (const rsp of rsps) {
        if (!rsp.ok) {
          throw new Error(`Unable to fetch Qwik WASM binding from ${rsp.url}`);
        }
      }
      const cjsRsp = rsps[0];
      const wasmRsp = rsps[1];
      const cjsCode = await cjsRsp.text();
      const cjsModule = {
        exports: {}
      };
      const cjsRun = new Function("module", "exports", cjsCode);
      cjsRun(cjsModule, cjsModule.exports);
      const mod = cjsModule.exports;
      await mod.default(wasmRsp);
      return mod;
    }
    false;
    throw new Error("Platform not supported");
  }
  var env = () => {
    if ("undefined" !== typeof Deno) {
      return "deno";
    }
    if ("undefined" !== typeof process && process.versions && process.versions.node && "undefined" !== typeof global) {
      return "node";
    }
    if ("undefined" !== typeof self && "undefined" !== typeof location && "undefined" !== typeof navigator && "function" === typeof fetch && "function" === typeof WorkerGlobalScope && "function" === typeof self.importScripts) {
      return "webworker";
    }
    if ("undefined" !== typeof window && "undefined" !== typeof document && "undefined" !== typeof location && "undefined" !== typeof navigator && "function" === typeof Window && "function" === typeof fetch) {
      return "browsermain";
    }
    return "unknown";
  };
  var extensions = {
    ".js": true,
    ".ts": true,
    ".tsx": true,
    ".jsx": true
  };
  var createOptimizer = async (optimizerOptions = {}) => {
    const sys = (null == optimizerOptions ? void 0 : optimizerOptions.sys) || await getSystem();
    const binding = (null == optimizerOptions ? void 0 : optimizerOptions.binding) || await loadPlatformBinding(sys);
    const optimizer = {
      transformModules: async opts => transformModulesSync(binding, opts),
      transformModulesSync: opts => transformModulesSync(binding, opts),
      transformFs: async opts => transformFsAsync(sys, binding, opts),
      transformFsSync: opts => transformFsSync(binding, opts),
      sys: sys
    };
    return optimizer;
  };
  var transformModulesSync = (binding, opts) => binding.transform_modules(convertOptions(opts));
  var transformFsSync = (binding, opts) => {
    if (binding.transform_fs) {
      return binding.transform_fs(convertOptions(opts));
    }
    throw new Error("Not implemented");
  };
  var transformFsAsync = async (sys, binding, fsOpts) => {
    if (binding.transform_fs && !sys.getInputFiles) {
      return binding.transform_fs(convertOptions(fsOpts));
    }
    const getInputFiles = await getPlatformInputFiles(sys);
    if (getInputFiles) {
      const input = await getInputFiles(fsOpts.rootDir);
      const modulesOpts = {
        rootDir: fsOpts.rootDir,
        entryStrategy: fsOpts.entryStrategy,
        minify: fsOpts.minify,
        sourceMaps: fsOpts.sourceMaps,
        transpile: fsOpts.transpile,
        input: input
      };
      return binding.transform_modules(convertOptions(modulesOpts));
    }
    throw new Error("Not implemented");
  };
  var convertOptions = opts => {
    var _a, _b;
    const output = {
      minify: "simplify",
      sourceMaps: false,
      transpile: false,
      explicityExtensions: false,
      dev: true
    };
    Object.entries(opts).forEach((([key, value]) => {
      null != value && (output[key] = value);
    }));
    output.entryStrategy = null != (_b = null == (_a = opts.entryStrategy) ? void 0 : _a.type) ? _b : "smart";
    return output;
  };
  function createPlugin(optimizerOptions = {}) {
    const id = `${Math.round(899 * Math.random()) + 100}`;
    const results = new Map;
    const injections = [];
    const transformedOutputs = new Map;
    let optimizer = null;
    let outputCount = 0;
    let addWatchFileCallback = () => {};
    let diagnosticsCallback = () => {};
    const opts = {
      debug: false,
      rootDir: null,
      outClientDir: null,
      outServerDir: null,
      isDevBuild: true,
      forceFullBuild: false,
      buildMode: "client",
      entryStrategy: null,
      minify: null,
      srcDir: null,
      srcInputs: null,
      srcRootInput: null,
      srcEntryServerInput: null,
      symbolsInput: null,
      symbolsOutput: null,
      transformedModuleOutput: null
    };
    const getOptimizer = async () => {
      optimizer || (optimizer = await createOptimizer(optimizerOptions));
      return optimizer;
    };
    const normalizeOptions = async inputOpts => {
      const updatedOpts = Object.assign({}, inputOpts);
      const optimizer2 = await getOptimizer();
      opts.debug = !!updatedOpts.debug;
      opts.isDevBuild = !!updatedOpts.isDevBuild;
      opts.buildMode = "ssr" === updatedOpts.buildMode ? "ssr" : "client";
      updatedOpts.entryStrategy && "object" === typeof updatedOpts.entryStrategy && (opts.entryStrategy = __spreadValues({}, updatedOpts.entryStrategy));
      opts.entryStrategy || (opts.isDevBuild ? opts.entryStrategy = {
        type: "hook"
      } : opts.entryStrategy = {
        type: "single"
      }); 
      opts.forceFullBuild = !!updatedOpts.forceFullBuild || "hook" !== opts.entryStrategy.type;
      updatedOpts.minify && (opts.minify = updatedOpts.minify);
      "minify" !== opts.minify && "none" !== opts.minify && "simplify" !== opts.minify && (opts.isDevBuild ? opts.minify = "none" : opts.minify = "minify");
      "string" === typeof updatedOpts.rootDir && (opts.rootDir = updatedOpts.rootDir);
      "string" !== typeof opts.rootDir && (opts.rootDir = optimizer2.sys.cwd());
      opts.rootDir = optimizer2.sys.path.resolve(optimizer2.sys.cwd(), opts.rootDir);
      let srcDir = optimizer2.sys.path.resolve(opts.rootDir, SRC_DIR_DEFAULT);
      if ("string" === typeof updatedOpts.srcDir) {
        opts.srcDir = optimizer2.sys.path.resolve(opts.rootDir, updatedOpts.srcDir);
        srcDir = opts.srcDir;
        opts.srcInputs = null;
      } else if (Array.isArray(updatedOpts.srcInputs)) {
        opts.srcInputs = [ ...updatedOpts.srcInputs ];
        opts.srcDir = null;
      } else {
        opts.srcDir = srcDir;
      }
      Array.isArray(opts.srcInputs) ? opts.srcInputs.forEach((i => {
        i.path = optimizer2.sys.path.resolve(opts.rootDir, i.path);
      })) : "string" === typeof opts.srcDir && (opts.srcDir = optimizer2.sys.path.resolve(opts.rootDir, opts.srcDir));
      "string" === typeof updatedOpts.srcRootInput ? opts.srcRootInput = [ updatedOpts.srcRootInput ] : Array.isArray(updatedOpts.srcRootInput) ? opts.srcRootInput = [ ...updatedOpts.srcRootInput ] : opts.srcRootInput = [ ROOT_FILENAME_DEFAULT ];
      opts.srcRootInput = opts.srcRootInput.map((p => optimizer2.sys.path.resolve(srcDir, p)));
      "string" === typeof updatedOpts.srcEntryServerInput ? opts.srcEntryServerInput = optimizer2.sys.path.resolve(srcDir, updatedOpts.srcEntryServerInput) : opts.srcEntryServerInput = optimizer2.sys.path.resolve(srcDir, ENTRY_SERVER_FILENAME_DEFAULT);
      "string" === typeof updatedOpts.outClientDir && (opts.outClientDir = updatedOpts.outClientDir);
      "string" !== typeof opts.outClientDir && (opts.outClientDir = DIST_DIR_DEFAULT);
      opts.outClientDir = optimizer2.sys.path.resolve(opts.rootDir, opts.outClientDir);
      "string" === typeof updatedOpts.outServerDir && (opts.outServerDir = updatedOpts.outServerDir);
      "string" !== typeof opts.outServerDir && (opts.outServerDir = SERVER_DIR_DEFAULT);
      opts.outServerDir = optimizer2.sys.path.resolve(opts.rootDir, opts.outServerDir);
      updatedOpts.symbolsInput && "object" === typeof updatedOpts.symbolsInput && "object" === typeof updatedOpts.symbolsInput.mapping && (opts.symbolsInput = updatedOpts.symbolsInput);
      "function" === typeof updatedOpts.symbolsOutput && (opts.symbolsOutput = updatedOpts.symbolsOutput);
      return __spreadValues({}, opts);
    };
    const validateSource = async () => {
      const optimizer2 = await getOptimizer();
      if ("node" === optimizer2.sys.env()) {
        const fs = await optimizer2.sys.dynamicImport("fs");
        if (!fs.existsSync(opts.rootDir)) {
          throw new Error(`Qwik rootDir "${opts.rootDir}" not found`);
        }
        if ("string" === typeof opts.srcDir && !fs.existsSync(opts.srcDir)) {
          throw new Error(`Qwik srcDir "${opts.srcDir}" not found`);
        }
        if (!fs.existsSync(opts.srcEntryServerInput)) {
          throw new Error(`Qwik srcEntryServerInput "${opts.srcEntryServerInput}" not found`);
        }
        opts.srcRootInput.forEach((input => {
          if (!fs.existsSync(input)) {
            throw new Error(`Qwik srcRootInput "${input}" not found`);
          }
        }));
      }
    };
    const buildStart = async () => {
      log("buildStart()", opts.buildMode, opts.forceFullBuild ? "full build" : "isolated build");
      if (opts.forceFullBuild) {
        const optimizer2 = await getOptimizer();
        outputCount = 0;
        let rootDir = "/";
        if ("string" === typeof opts.srcDir) {
          rootDir = opts.srcDir;
          log("buildStart() srcDir", opts.srcDir);
        } else if (Array.isArray(opts.srcInputs)) {
          optimizer2.sys.getInputFiles = async rootDir2 => opts.srcInputs.map((i => {
            const relInput = {
              path: optimizer2.sys.path.relative(rootDir2, i.path),
              code: i.code
            };
            return relInput;
          }));
          log(`buildStart() opts.srcInputs (${opts.srcInputs.length})`);
        }
        const transformOpts = {
          rootDir: rootDir,
          entryStrategy: opts.entryStrategy,
          minify: opts.minify,
          transpile: true,
          explicityExtensions: true
        };
        const result = await optimizer2.transformFs(transformOpts);
        for (const output of result.modules) {
          const key = optimizer2.sys.path.join(rootDir, output.path);
          log("buildStart()", "qwik module", key);
          transformedOutputs.set(key, [ output, key ]);
        }
        diagnosticsCallback(result.diagnostics, optimizer2);
        results.set("@buildStart", result);
      }
    };
    const resolveId = async (id2, importer) => {
      if (id2 === QWIK_BUILD_ID) {
        log("resolveId()", "Resolved", QWIK_BUILD_ID);
        return {
          id: QWIK_BUILD_ID,
          moduleSideEffects: false
        };
      }
      const optimizer2 = await getOptimizer();
      const parsedId = parseId(id2);
      let importeePathId = parsedId.pathId;
      if (importer) {
        log(`resolveId("${importeePathId}", "${importer}")`);
        const parsedImporterId = parseId(importer);
        const dir = optimizer2.sys.path.dirname(parsedImporterId.pathId);
        importeePathId = parsedImporterId.pathId.endsWith(".html") && !importeePathId.endsWith(".html") ? optimizer2.sys.path.join(dir, importeePathId) : optimizer2.sys.path.resolve(dir, importeePathId);
      } else {
        log(`resolveId("${importeePathId}"), No importer`);
      }
      const tryImportPathIds = [ forceJSExtension(optimizer2.sys.path, importeePathId) ];
      for (const tryId of tryImportPathIds) {
        const transformedOutput = transformedOutputs.get(tryId);
        if (transformedOutput) {
          log(`resolveId() Resolved ${tryId}`);
          const transformedModule = transformedOutput[0];
          const sideEffects = !transformedModule.isEntry || !transformedModule.hook;
          return {
            id: tryId,
            moduleSideEffects: sideEffects
          };
        }
        log(`resolveId() Resolved not found ${tryId}`);
      }
      return null;
    };
    const load = async id2 => {
      const optimizer2 = await getOptimizer();
      if (id2 === QWIK_BUILD_ID) {
        log("load()", QWIK_BUILD_ID, opts.buildMode);
        return {
          code: getBuildTimeModule(opts)
        };
      }
      opts.forceFullBuild && (id2 = forceJSExtension(optimizer2.sys.path, id2));
      const transformedModule = transformedOutputs.get(id2);
      if (transformedModule) {
        log("load()", "Found", id2);
        return {
          code: transformedModule[0].code,
          map: transformedModule[0].map
        };
      }
      log("load()", "Not Found", id2);
      return null;
    };
    const transform = async (code, id2) => {
      if (opts.forceFullBuild) {
        return null;
      }
      const pregenerated = transformedOutputs.get(id2);
      if (pregenerated) {
        log("transform() pregenerated, addWatchFile", id2, pregenerated[1]);
        addWatchFileCallback(pregenerated[1]);
        return {
          meta: {
            hook: pregenerated[0].hook
          }
        };
      }
      const optimizer2 = await getOptimizer();
      const {pathId: pathId} = parseId(id2);
      const {ext: ext, dir: dir, base: base} = optimizer2.sys.path.parse(pathId);
      if (TRANSFORM_EXTS[ext]) {
        log("transform()", "Transforming", pathId);
        const newOutput = optimizer2.transformModulesSync({
          input: [ {
            code: code,
            path: base
          } ],
          entryStrategy: {
            type: "hook"
          },
          minify: opts.minify,
          sourceMaps: false,
          transpile: true,
          explicityExtensions: true,
          rootDir: dir
        });
        diagnosticsCallback(newOutput.diagnostics, optimizer2);
        results.set(pathId, newOutput);
        transformedOutputs.clear();
        for (const [id3, output] of results.entries()) {
          const justChanged = newOutput === output;
          const dir2 = optimizer2.sys.path.dirname(id3);
          for (const mod of output.modules) {
            if (mod.isEntry) {
              const key = optimizer2.sys.path.join(dir2, mod.path);
              transformedOutputs.set(key, [ mod, id3 ]);
              log("transform()", "emitting", justChanged, key);
            }
          }
        }
        const module2 = newOutput.modules.find((m => !m.isEntry));
        return {
          code: module2.code,
          map: module2.map,
          meta: {
            hook: module2.hook
          }
        };
      }
      log("transform()", "No Transforming", id2);
      return null;
    };
    const createOutputAnalyzer = () => {
      const bundles = [];
      const addBundle = b => bundles.push(b);
      const generateSymbolsEntryMap = async () => {
        const optimizer2 = await getOptimizer();
        const symbolsEntryMap = {
          version: "1",
          mapping: {},
          injections: injections
        };
        const hooks = Array.from(results.values()).flatMap((r => r.modules)).map((mod => mod.hook)).filter((h => !!h));
        if (hooks.length > 0 && 0 === outputCount) {
          outputCount++;
          hooks.forEach((h => {
            const symbolName = h.name;
            let basename = h.canonicalFilename + ".js";
            const found = bundles.find((b => Object.keys(b.modules).find((f => f.endsWith(basename)))));
            found && (basename = found.fileName);
            basename = optimizer2.sys.path.basename(basename);
            symbolsEntryMap.mapping[symbolName] = basename;
          }));
        }
        log("generateSymbolsEntryMap()", symbolsEntryMap);
        return symbolsEntryMap;
      };
      return {
        addBundle: addBundle,
        generateSymbolsEntryMap: generateSymbolsEntryMap
      };
    };
    const getOptions = () => __spreadValues({}, opts);
    const getTransformedOutputs = () => {
      const to = {};
      for (const [v, id2] of transformedOutputs.values()) {
        to[id2] = v;
      }
      return to;
    };
    const updateSymbolsEntryMap = (symbolsStr, code) => code.replace(/("|')__qSymbolsEntryMap__("|')/g, symbolsStr);
    const log = (...str) => {
      opts.debug && console.debug(`[QWIK PLUGIN: ${id}]`, ...str);
    };
    const onAddWatchFile = cb => {
      addWatchFileCallback = cb;
    };
    const onDiagnostics = cb => {
      diagnosticsCallback = cb;
    };
    return {
      buildStart: buildStart,
      createOutputAnalyzer: createOutputAnalyzer,
      getOptimizer: getOptimizer,
      getOptions: getOptions,
      getTransformedOutputs: getTransformedOutputs,
      load: load,
      log: log,
      normalizeOptions: normalizeOptions,
      onAddWatchFile: onAddWatchFile,
      onDiagnostics: onDiagnostics,
      resolveId: resolveId,
      transform: transform,
      updateSymbolsEntryMap: updateSymbolsEntryMap,
      validateSource: validateSource
    };
  }
  function getBuildTimeModule(opts) {
    return `\nexport const isServer = ${"ssr" === opts.buildMode};\nexport const isBrowser = ${"client" === opts.buildMode};\n`;
  }
  function parseId(originalId) {
    const [pathId, querystrings] = originalId.split("?");
    return {
      originalId: originalId,
      pathId: pathId,
      params: new URLSearchParams(querystrings || "")
    };
  }
  function forceJSExtension(path, id) {
    const ext = path.extname(id);
    if ("" === ext) {
      return id + ".js";
    }
    if (TRANSFORM_EXTS[ext]) {
      return removeExtension(id) + ".js";
    }
    return id;
  }
  function removeExtension(id) {
    return id.split(".").slice(0, -1).join(".");
  }
  var TRANSFORM_EXTS = {
    ".jsx": true,
    ".ts": true,
    ".tsx": true
  };
  var QWIK_CORE_ID = "@builder.io/qwik";
  var QWIK_BUILD_ID = "@builder.io/qwik/build";
  var QWIK_JSX_RUNTIME_ID = "@builder.io/qwik/jsx-runtime";
  var SRC_DIR_DEFAULT = "src";
  var ROOT_FILENAME_DEFAULT = "root.tsx";
  var ENTRY_SERVER_FILENAME_DEFAULT = "entry.server.tsx";
  var DIST_DIR_DEFAULT = "dist";
  var SERVER_DIR_DEFAULT = "server";
  var SYMBOLS_MANIFEST_FILENAME = "symbols-manifest.json";
  function qwikRollup(qwikRollupOpts = {}) {
    const qwikPlugin = createPlugin(qwikRollupOpts.optimizerOptions);
    const rollupPlugin = {
      name: "rollup-plugin-qwik",
      api: {
        getOptimizer: () => qwikPlugin.getOptimizer()
      },
      async options(inputOpts) {
        inputOpts.onwarn = (warning, warn) => {
          if ("typescript" === warning.plugin && warning.message.includes("outputToFilesystem")) {
            return;
          }
          warn(warning);
        };
        const opts = await qwikPlugin.normalizeOptions(qwikRollupOpts);
        if ("ssr" === opts.buildMode) {
          inputOpts.input || (inputOpts.input = opts.srcEntryServerInput);
          inputOpts.treeshake = false;
        } else {
          inputOpts.input || (inputOpts.input = opts.srcRootInput);
        }
        return inputOpts;
      },
      outputOptions(outputOpts) {
        const opts = qwikPlugin.getOptions();
        if ("ssr" === opts.buildMode) {
          outputOpts.dir || (outputOpts.dir = opts.outClientDir);
          outputOpts.format || (outputOpts.format = "cjs");
        } else {
          outputOpts.dir || (outputOpts.dir = opts.outServerDir);
          outputOpts.format || (outputOpts.format = "es");
        }
        "cjs" === outputOpts.format && "string" !== typeof outputOpts.exports && (outputOpts.exports = "auto");
        return outputOpts;
      },
      async buildStart() {
        qwikPlugin.onAddWatchFile((path => this.addWatchFile(path)));
        qwikPlugin.onDiagnostics(((diagnostics, optimizer) => {
          diagnostics.forEach((d => {
            "Error" === d.severity ? this.error(createRollupError(optimizer, d)) : this.warn(createRollupError(optimizer, d));
          }));
        }));
        await qwikPlugin.buildStart();
      },
      resolveId(id, importer) {
        if (id.startsWith("\0")) {
          return null;
        }
        return qwikPlugin.resolveId(id, importer);
      },
      load(id) {
        if (id.startsWith("\0")) {
          return null;
        }
        return qwikPlugin.load(id);
      },
      transform(code, id) {
        if (id.startsWith("\0")) {
          return null;
        }
        return qwikPlugin.transform(code, id);
      },
      async generateBundle(_, rollupBundle) {
        const opts = qwikPlugin.getOptions();
        if ("client" === opts.buildMode) {
          const outputAnalyzer = qwikPlugin.createOutputAnalyzer();
          for (const fileName in rollupBundle) {
            const b = rollupBundle[fileName];
            "chunk" === b.type && b.isDynamicEntry && outputAnalyzer.addBundle({
              fileName: fileName,
              modules: b.modules
            });
          }
          const symbolsEntryMap = await outputAnalyzer.generateSymbolsEntryMap();
          "function" === typeof opts.symbolsOutput && await opts.symbolsOutput(symbolsEntryMap);
          this.emitFile({
            type: "asset",
            fileName: SYMBOLS_MANIFEST_FILENAME,
            source: JSON.stringify(symbolsEntryMap, null, 2)
          });
          "function" === typeof opts.transformedModuleOutput && await opts.transformedModuleOutput(qwikPlugin.getTransformedOutputs());
        } else if ("ssr" === opts.buildMode && opts.symbolsInput && "object" === typeof opts.symbolsInput) {
          const symbolsStr = JSON.stringify(opts.symbolsInput);
          for (const fileName in rollupBundle) {
            const b = rollupBundle[fileName];
            "chunk" === b.type && (b.code = qwikPlugin.updateSymbolsEntryMap(symbolsStr, b.code));
          }
          this.emitFile({
            type: "asset",
            fileName: SYMBOLS_MANIFEST_FILENAME,
            source: JSON.stringify(opts.symbolsInput, null, 2)
          });
        }
      }
    };
    return rollupPlugin;
  }
  var createRollupError = (optimizer, diagnostic) => {
    var _a, _b;
    const loc = null != (_b = null == (_a = diagnostic.code_highlights[0]) ? void 0 : _a.loc) ? _b : {};
    const id = optimizer ? optimizer.sys.path.join(optimizer.sys.cwd(), diagnostic.origin) : diagnostic.origin;
    const err = Object.assign(new Error(diagnostic.message), {
      id: id,
      plugin: "qwik",
      loc: {
        column: loc.start_col,
        line: loc.start_line
      },
      stack: ""
    });
    return err;
  };
  var QWIK_LOADER_DEFAULT_MINIFIED = '((e,t,r)=>{const n="__q_context__",o=["on:","on-window:","on-document:"],s=(t,r,n)=>{r=r.replace(/([A-Z])/g,(e=>"-"+e.toLowerCase())),e.querySelectorAll("[on"+t+"\\\\:"+r+"]").forEach((e=>l(e,r,n)))},a=(e,t)=>e.dispatchEvent(new CustomEvent("qSymbol",{detail:{name:t},bubbles:!0,composed:!0})),i=e=>{throw Error("QWIK "+e)},c=(t,r)=>(t=t.closest("[q\\\\:container]"),new URL(r,new URL(t?t.getAttribute("q:base"):e.baseURI,e.baseURI))),l=async(t,r,s)=>{for(const l of o){const o=t.getAttribute(l+r);if(o){t.hasAttribute("preventdefault:"+r)&&s.preventDefault();for(const r of o.split("\\n")){const o=c(t,r);if(o){const r=b(o),c=(window[o.pathname]||await import(o.href.split("#")[0]))[r]||i(o+" does not export "+r),l=e[n];try{e[n]=[t,s,o],c(s,t,o)}finally{e[n]=l,a(t,r)}}}}}},b=e=>e.hash.replace(/^#?([^?[|]*).*$/,"$1")||"default",u=(t,r)=>{if((r=t.target)==e)setTimeout((()=>s("-document",t.type,t)));else for(;r&&r.getAttribute;)l(r,t.type,t),r=t.bubbles?r.parentElement:null},f=e=>(r||(r=new Worker(URL.createObjectURL(new Blob([\'addEventListener("message",(e=>e.data.map((e=>fetch(e)))));\'],{type:"text/javascript"})))),r.postMessage(e.getAttribute("q:prefetch").split("\\n").map((t=>c(e,t)+""))),r),p=r=>{if(r=e.readyState,!t&&("interactive"==r||"complete"==r)&&(t=1,s("","q-resume",new CustomEvent("qResume")),e.querySelectorAll("[q\\\\:prefetch]").forEach(f),"undefined"!=typeof IntersectionObserver)){const t=new IntersectionObserver((e=>{for(const r of e)r.isIntersecting&&(t.unobserve(r.target),l(r.target,"q-visible",new CustomEvent("qVisible",{bubbles:!1,detail:r})))}));new MutationObserver((e=>{for(const r of e)r.target.hasAttribute("on:q-visible")&&t.observe(r.target)})).observe(document.body,{attributeFilter:["on:q-visible"],subtree:!0}),e.querySelectorAll("[on\\\\:q-visible]").forEach((e=>t.observe(e)))}},d=t=>e.addEventListener(t,u,{capture:!0});if(!e.qR){e.qR=1;{const t=e.querySelector("script[events]");if(t)t.getAttribute("events").split(/[\\s,;]+/).forEach(d);else for(const t in e)t.startsWith("on")&&d(t.slice(2))}e.addEventListener("readystatechange",p),p()}})(document);';
  var QWIK_LOADER_DEFAULT_DEBUG = '(() => {\n    ((doc, hasInitialized, prefetchWorker) => {\n        const ON_PREFIXES = [ "on:", "on-window:", "on-document:" ];\n        const broadcast = (infix, type, ev) => {\n            type = type.replace(/([A-Z])/g, (a => "-" + a.toLowerCase()));\n            doc.querySelectorAll("[on" + infix + "\\\\:" + type + "]").forEach((target => dispatch(target, type, ev)));\n        };\n        const symbolUsed = (el, symbolName) => el.dispatchEvent(new CustomEvent("qSymbol", {\n            detail: {\n                name: symbolName\n            },\n            bubbles: !0,\n            composed: !0\n        }));\n        const error = msg => {\n            throw new Error("QWIK " + msg);\n        };\n        const qrlResolver = (element, qrl) => {\n            element = element.closest("[q\\\\:container]");\n            return new URL(qrl, new URL(element ? element.getAttribute("q:base") : doc.baseURI, doc.baseURI));\n        };\n        const dispatch = async (element, eventName, ev) => {\n            for (const onPrefix of ON_PREFIXES) {\n                const attrValue = element.getAttribute(onPrefix + eventName);\n                if (attrValue) {\n                    element.hasAttribute("preventdefault:" + eventName) && ev.preventDefault();\n                    for (const qrl of attrValue.split("\\n")) {\n                        const url = qrlResolver(element, qrl);\n                        if (url) {\n                            const symbolName = getSymbolName(url);\n                            const handler = (window[url.pathname] || await import(url.href.split("#")[0]))[symbolName] || error(url + " does not export " + symbolName);\n                            const previousCtx = doc.__q_context__;\n                            try {\n                                doc.__q_context__ = [ element, ev, url ];\n                                handler(ev, element, url);\n                            } finally {\n                                doc.__q_context__ = previousCtx;\n                                symbolUsed(element, symbolName);\n                            }\n                        }\n                    }\n                }\n            }\n        };\n        const getSymbolName = url => url.hash.replace(/^#?([^?[|]*).*$/, "$1") || "default";\n        const processEvent = (ev, element) => {\n            if ((element = ev.target) == doc) {\n                setTimeout((() => broadcast("-document", ev.type, ev)));\n            } else {\n                while (element && element.getAttribute) {\n                    dispatch(element, ev.type, ev);\n                    element = ev.bubbles ? element.parentElement : null;\n                }\n            }\n        };\n        const qrlPrefetch = element => {\n            prefetchWorker || (prefetchWorker = new Worker(URL.createObjectURL(new Blob([ \'addEventListener("message",(e=>e.data.map((e=>fetch(e)))));\' ], {\n                type: "text/javascript"\n            }))));\n            prefetchWorker.postMessage(element.getAttribute("q:prefetch").split("\\n").map((qrl => qrlResolver(element, qrl) + "")));\n            return prefetchWorker;\n        };\n        const processReadyStateChange = readyState => {\n            readyState = doc.readyState;\n            if (!hasInitialized && ("interactive" == readyState || "complete" == readyState)) {\n                hasInitialized = 1;\n                broadcast("", "q-resume", new CustomEvent("qResume"));\n                doc.querySelectorAll("[q\\\\:prefetch]").forEach(qrlPrefetch);\n                if ("undefined" != typeof IntersectionObserver) {\n                    const observer = new IntersectionObserver((entries => {\n                        for (const entry of entries) {\n                            if (entry.isIntersecting) {\n                                observer.unobserve(entry.target);\n                                dispatch(entry.target, "q-visible", new CustomEvent("qVisible", {\n                                    bubbles: !1,\n                                    detail: entry\n                                }));\n                            }\n                        }\n                    }));\n                    new MutationObserver((mutations => {\n                        for (const mutation2 of mutations) {\n                            mutation2.target.hasAttribute("on:q-visible") && observer.observe(mutation2.target);\n                        }\n                    })).observe(document.body, {\n                        attributeFilter: [ "on:q-visible" ],\n                        subtree: !0\n                    });\n                    doc.querySelectorAll("[on\\\\:q-visible]").forEach((el => observer.observe(el)));\n                }\n            }\n        };\n        const addDocEventListener = eventName => doc.addEventListener(eventName, processEvent, {\n            capture: !0\n        });\n        if (!doc.qR) {\n            doc.qR = 1;\n            {\n                const scriptTag = doc.querySelector("script[events]");\n                if (scriptTag) {\n                    scriptTag.getAttribute("events").split(/[\\s,;]+/).forEach(addDocEventListener);\n                } else {\n                    for (const key in doc) {\n                        key.startsWith("on") && addDocEventListener(key.slice(2));\n                    }\n                }\n            }\n            doc.addEventListener("readystatechange", processReadyStateChange);\n            processReadyStateChange();\n        }\n    })(document);\n})();';
  function qwikVite(qwikViteOpts = {}) {
    let hasValidatedSource = false;
    let isClientOnly = false;
    let srcEntryDevInput = "";
    const qwikPlugin = createPlugin(qwikViteOpts.optimizerOptions);
    const vitePlugin = {
      name: "vite-plugin-qwik",
      enforce: "pre",
      api: {
        getOptions: qwikPlugin.getOptions
      },
      async config(viteConfig, viteEnv) {
        qwikPlugin.log(`vite config(), command: ${viteEnv.command}, env.mode: ${viteEnv.mode}`);
        isClientOnly = "serve" === viteEnv.command && "ssr" !== viteEnv.mode;
        const pluginOpts = {
          debug: qwikViteOpts.debug,
          isDevBuild: "serve" === viteEnv.command,
          buildMode: "build" === viteEnv.command && "ssr" === viteEnv.mode ? "ssr" : "client",
          entryStrategy: qwikViteOpts.entryStrategy,
          minify: qwikViteOpts.minify,
          rootDir: viteConfig.root,
          outClientDir: qwikViteOpts.outClientDir,
          outServerDir: qwikViteOpts.outServerDir,
          srcInputs: qwikViteOpts.srcInputs,
          srcRootInput: qwikViteOpts.srcRootInput,
          srcEntryServerInput: qwikViteOpts.srcEntryServerInput,
          symbolsOutput: qwikViteOpts.symbolsOutput
        };
        const optimizer = await qwikPlugin.getOptimizer();
        const opts = await qwikPlugin.normalizeOptions(pluginOpts);
        srcEntryDevInput = "string" === typeof qwikViteOpts.srcEntryDevInput ? optimizer.sys.path.resolve(opts.srcDir ? opts.srcDir : opts.rootDir, qwikViteOpts.srcEntryDevInput) : optimizer.sys.path.resolve(opts.srcDir ? opts.srcDir : opts.rootDir, ENTRY_DEV_FILENAME_DEFAULT);
        const updatedViteConfig = {
          esbuild: {
            include: /\.js$/
          },
          optimizeDeps: {
            include: [ QWIK_CORE_ID, QWIK_JSX_RUNTIME_ID ],
            exclude: [ "@vite/client", "@vite/env" ]
          },
          build: {
            rollupOptions: {
              output: {
                chunkFileNames: "build/q-[hash].js",
                assetFileNames: "build/q-[hash].[ext]"
              },
              onwarn: (warning, warn) => {
                if ("typescript" === warning.plugin && warning.message.includes("outputToFilesystem")) {
                  return;
                }
                warn(warning);
              }
            },
            polyfillModulePreload: false,
            dynamicImportVarsOptions: {
              exclude: [ /./ ]
            }
          }
        };
        "serve" === viteEnv.command && (pluginOpts.entryStrategy = {
          type: "hook"
        });
        if ("ssr" === opts.buildMode) {
          updatedViteConfig.build.rollupOptions.input = opts.srcEntryServerInput;
          updatedViteConfig.build.outDir = opts.outServerDir;
          updatedViteConfig.build.ssr = true;
          updatedViteConfig.build.emptyOutDir = false;
          updatedViteConfig.ssr && false === updatedViteConfig.ssr.noExternal || (updatedViteConfig.ssr ? updatedViteConfig.ssr.noExternal = true : updatedViteConfig.ssr = {
            noExternal: true
          });
        } else {
          updatedViteConfig.build.rollupOptions.input = isClientOnly ? srcEntryDevInput : opts.srcRootInput;
          updatedViteConfig.build.outDir = opts.outClientDir;
        }
        return updatedViteConfig;
      },
      outputOptions(outputOpts) {
        "cjs" === outputOpts.format && "string" !== typeof outputOpts.exports && (outputOpts.exports = "auto");
        return outputOpts;
      },
      async buildStart() {
        if (!hasValidatedSource) {
          await qwikPlugin.validateSource();
          hasValidatedSource = true;
        }
        qwikPlugin.onAddWatchFile((path => this.addWatchFile(path)));
        qwikPlugin.onDiagnostics(((diagnostics, optimizer) => {
          diagnostics.forEach((d => {
            "Error" === d.severity ? this.error(createRollupError(optimizer, d)) : this.warn(createRollupError(optimizer, d));
          }));
        }));
        await qwikPlugin.buildStart();
      },
      resolveId(id, importer) {
        if (id.startsWith("\0")) {
          return null;
        }
        if (isClientOnly && id === VITE_CLIENT_MODULE) {
          return id;
        }
        return qwikPlugin.resolveId(id, importer);
      },
      async load(id) {
        if (id.startsWith("\0")) {
          return null;
        }
        if (isClientOnly && id === VITE_CLIENT_MODULE) {
          const opts = qwikPlugin.getOptions();
          return getViteDevModule(opts);
        }
        return qwikPlugin.load(id);
      },
      transform(code, id) {
        if (id.startsWith("\0")) {
          return null;
        }
        if (isClientOnly) {
          const parsedId = parseId(id);
          parsedId.params.has(VITE_DEV_CLIENT_QS) && (code = updateEntryDev(code));
        }
        return qwikPlugin.transform(code, id);
      },
      async generateBundle(_, rollupBundle) {
        const opts = qwikPlugin.getOptions();
        const optimizer = await qwikPlugin.getOptimizer();
        if ("client" === opts.buildMode) {
          const outputAnalyzer = qwikPlugin.createOutputAnalyzer();
          for (const fileName in rollupBundle) {
            const b = rollupBundle[fileName];
            "chunk" === b.type && b.isDynamicEntry && outputAnalyzer.addBundle({
              fileName: fileName,
              modules: b.modules
            });
          }
          const symbolsEntryMap = await outputAnalyzer.generateSymbolsEntryMap();
          "function" === typeof opts.symbolsOutput && await opts.symbolsOutput(symbolsEntryMap);
          this.emitFile({
            type: "asset",
            fileName: SYMBOLS_MANIFEST_FILENAME,
            source: JSON.stringify(symbolsEntryMap, null, 2)
          });
          "function" === typeof opts.transformedModuleOutput && await opts.transformedModuleOutput(qwikPlugin.getTransformedOutputs());
        } else if ("ssr" === opts.buildMode) {
          let symbolsInput = opts.symbolsInput;
          if (!symbolsInput && "node" === optimizer.sys.env()) {
            try {
              const fs = await optimizer.sys.dynamicImport("fs");
              const qSymbolsPath = optimizer.sys.path.join(opts.outClientDir, SYMBOLS_MANIFEST_FILENAME);
              const qSymbolsContent = fs.readFileSync(qSymbolsPath, "utf-8");
              symbolsInput = JSON.parse(qSymbolsContent);
            } catch (e) {}
          }
          if (symbolsInput && "object" === typeof symbolsInput) {
            const symbolsStr = JSON.stringify(symbolsInput);
            for (const fileName in rollupBundle) {
              const b = rollupBundle[fileName];
              "chunk" === b.type && (b.code = qwikPlugin.updateSymbolsEntryMap(symbolsStr, b.code));
            }
            this.emitFile({
              type: "asset",
              fileName: SYMBOLS_MANIFEST_FILENAME,
              source: JSON.stringify(symbolsInput, null, 2)
            });
          }
        }
      },
      async configureServer(server) {
        const opts = qwikPlugin.getOptions();
        qwikPlugin.log(`configureServer(), entry module: ${opts.srcEntryServerInput}`);
        const optimizer = await qwikPlugin.getOptimizer();
        if ("function" !== typeof fetch && "node" === optimizer.sys.env()) {
          qwikPlugin.log("configureServer(), patch fetch()");
          const nodeFetch = await optimizer.sys.dynamicImport("node-fetch");
          global.fetch = nodeFetch;
          global.Headers = nodeFetch.Headers;
          global.Request = nodeFetch.Request;
          global.Response = nodeFetch.Response;
        }
        server.middlewares.use((async (req, res, next) => {
          var _a;
          const domain = "http://" + (null != (_a = req.headers.host) ? _a : "localhost");
          const url = new URL(req.originalUrl, domain);
          const pathname = url.pathname;
          const hasExtension = /\.[\w?=&]+$/.test(pathname);
          const isViteMod = pathname.startsWith("/@") || url.href.includes("?html-proxy");
          const isVitePing = url.href.includes("__vite_ping");
          const skipSSR = url.href.includes("ssr=false");
          if (hasExtension || isViteMod || isVitePing || skipSSR) {
            next();
            return;
          }
          try {
            if (isClientOnly) {
              qwikPlugin.log(`handleClientEntry("${url}")`);
              let entryUrl = optimizer.sys.path.relative(opts.rootDir, srcEntryDevInput);
              entryUrl = "/" + entryUrl.replace(/\\/g, "/");
              let html = getViteDevIndexHtml(entryUrl);
              html = await server.transformIndexHtml(pathname, html);
              res.setHeader("Content-Type", "text/html; charset=utf-8");
              res.setHeader("Cache-Control", "no-cache");
              res.setHeader("Access-Control-Allow-Origin", "*");
              res.setHeader("X-Powered-By", "Qwik Vite Dev Server");
              res.writeHead(200);
              res.end(html);
              return;
            }
            qwikPlugin.log(`handleSSR("${url}")`);
            const {render: render} = await server.ssrLoadModule(opts.srcEntryServerInput, {
              fixStacktrace: true
            });
            if (render) {
              const symbols = {
                version: "1",
                mapping: {},
                injections: []
              };
              Array.from(server.moduleGraph.fileToModulesMap.entries()).forEach((entry => {
                entry[1].forEach((v => {
                  var _a2, _b;
                  const hook = null == (_b = null == (_a2 = v.info) ? void 0 : _a2.meta) ? void 0 : _b.hook;
                  hook && v.lastHMRTimestamp && (symbols.mapping[hook.name] = `${v.url}?t=${v.lastHMRTimestamp}`);
                }));
              }));
              qwikPlugin.log("handleSSR()", "symbols", symbols);
              const mainMod = await server.moduleGraph.getModuleByUrl(opts.srcRootInput[0]);
              mainMod && mainMod.importedModules.forEach((moduleNode => {
                moduleNode.url.endsWith(".css") && symbols.injections.push({
                  tag: "link",
                  location: "head",
                  attributes: {
                    rel: "stylesheet",
                    href: moduleNode.url
                  }
                });
              }));
              const renderToStringOpts = {
                url: url.href,
                debug: true,
                symbols: isClientOnly ? null : symbols,
                snapshot: !isClientOnly
              };
              const result = await render(renderToStringOpts);
              const html = await server.transformIndexHtml(pathname, result.html, req.originalUrl);
              res.setHeader("Content-Type", "text/html; charset=utf-8");
              res.setHeader("Cache-Control", "no-cache");
              res.setHeader("Access-Control-Allow-Origin", "*");
              res.setHeader("X-Powered-By", "Qwik Vite Dev Server");
              res.writeHead(200);
              res.end(html);
            } else {
              next();
            }
          } catch (e) {
            server.ssrFixStacktrace(e);
            next(e);
          }
        }));
      },
      handleHotUpdate(ctx) {
        qwikPlugin.log("handleHotUpdate()", ctx);
        if (ctx.file.endsWith(".css")) {
          qwikPlugin.log("handleHotUpdate()", "force css reload");
          ctx.server.ws.send({
            type: "full-reload"
          });
          return [];
        }
      }
    };
    return vitePlugin;
  }
  function getViteDevIndexHtml(entryUrl) {
    return `\x3c!-- Qwik Vite Dev Mode --\x3e\n<!DOCTYPE html>\n<html>\n  <head></head>\n  <body>\n    <script type="module" src="${entryUrl}?${VITE_DEV_CLIENT_QS}="><\/script>\n  </body>\n</html>`;
  }
  function updateEntryDev(code) {
    code = code.replace(/("|')@builder.io\/qwik("|')/g, `'${VITE_CLIENT_MODULE}'`);
    return code;
  }
  function getViteDevModule(opts) {
    const qwikLoader = JSON.stringify(opts.debug ? QWIK_LOADER_DEFAULT_DEBUG : QWIK_LOADER_DEFAULT_MINIFIED);
    return `// Qwik Vite Dev Module\nimport { render as qwikRender } from '@builder.io/qwik';\n\nexport function render(document, rootNode) {\n  const headNodes = [];\n  document.head.childNodes.forEach(n => headNodes.push(n));\n  document.head.textContent = '';\n\n  qwikRender(document, rootNode);\n\n  headNodes.forEach(n => document.head.appendChild(n));\n  \n  let qwikLoader = document.getElementById('qwikloader');\n  if (!qwikLoader) {\n    qwikLoader = document.createElement('script');\n    qwikLoader.id = 'qwikloader';\n    qwikLoader.innerHTML = ${qwikLoader};\n    document.head.appendChild(qwikLoader);\n  }\n\n  if (!window.__qwikViteLog) {\n    window.__qwikViteLog = true;\n    console.debug("%c⭐️ Qwik Dev Mode","background: #0c75d2; color: white; padding: 2px 3px; border-radius: 2px; font-size: 0.8em;","Do not use this mode in production!\\n - No portion of the application is pre-rendered on the server\\n - All of the application is running eagerly in the browser\\n - Optimizer/Serialization/Deserialization code is not exercised!");\n  }\n}`;
  }
  var VITE_CLIENT_MODULE = "@builder.io/qwik/vite-client";
  var VITE_DEV_CLIENT_QS = "qwik-vite-dev-client";
  var ENTRY_DEV_FILENAME_DEFAULT = "entry.dev.tsx";
  return module.exports;
}("object" === typeof module && module.exports ? module : {
  exports: {}
});