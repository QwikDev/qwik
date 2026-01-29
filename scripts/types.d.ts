/**
 * Type definitions for scripts utilities This file allows package code to import types without
 * importing the implementation
 */

export interface PackageJSON {
  name?: string;
  version?: string;
  description?: string;
  license?: string;
  main?: string;
  module?: string;
  types?: string;
  type?: "module" | "commonjs";
  exports?: Record<string, any>;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  [key: string]: any;
}

export interface BuildConfig {
  rootDir: string;
  srcDir: string;
  srcQwikDir: string;
  srcQwikCityDir: string;
  packagesDir: string;
  distQwikPkgDir: string;
  distQwikCityPkgDir: string;
  dtsDir: string;
  [key: string]: any;
}
