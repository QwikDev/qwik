# This is a Nix configuration file. It is used to define the environment
# for the project. It is a declarative way to define the dependencies.
# It is used by the `nix develop` command to create a development environment
# with all the dependencies needed for the project.

# To update the dependencies, run `nix flake update`.

# Note: keep the playwright version in package.json syncpack the same as the nix version
# We don't need to have the latest playwright all the time so not having to download
# all the browsers on every version bump is a good thing.
{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    rust-overlay.url = "github:oxalica/rust-overlay";
  };

  outputs = { self, rust-overlay, nixpkgs }:
    let
      b = builtins;
      perSystem = system: _pkgs:
        let
          overlays = [ (import rust-overlay) ];
          pkgs = import nixpkgs {
            inherit system overlays;
          };
          lib = pkgs.lib;
          pnpm = pkgs.pnpm_10.override { nodejs-slim = pkgs.nodejs-slim_24; };
          pnpmDependencySource = lib.cleanSourceWith {
            name = "qwik-pnpm-dependency-source";
            src = ./.;
            filter = path: type:
              let
                root = toString ./.;
                rel = lib.removePrefix "${root}/" (toString path);
                isWorkspaceConfig = builtins.elem rel [
                  ".npmrc"
                  "package.json"
                  "pnpm-lock.yaml"
                  "pnpm-workspace.yaml"
                ];
                isWorkspacePackageConfig =
                  builtins.match "(packages|e2e)/[^/]+/(package\\.json|\\.npmrc)" rel != null;
              in
              type == "directory"
              || isWorkspaceConfig
              || isWorkspacePackageConfig
              || lib.hasPrefix "patches/" rel;
          };
          pnpmDependencySourceId = b.substring 0 12 (b.hashString "sha256" (toString pnpmDependencySource));
          # CI prints the replacement hash when a platform hash is missing or stale.
          pnpmDepsHash = {
            x86_64-linux = "sha256-kpjBxC8qiyv+ozqXqixTgRc14lijAhKf2PpovSrUUx8=";
          }.${system} or lib.fakeHash;
          pnpmDeps = pkgs.fetchPnpmDeps {
            pname = "qwik-${pnpmDependencySourceId}";
            version = "0.0.0";
            src = pnpmDependencySource;
            inherit pnpm;
            fetcherVersion = 4;
            hash = pnpmDepsHash;
          };
          nodeModules = pkgs.stdenvNoCC.mkDerivation {
            pname = "qwik-${pnpmDependencySourceId}-node-modules";
            version = "0.0.0";
            src = pnpmDependencySource;
            nativeBuildInputs = with pkgs; [
              coreutils
              gnutar
              nodejs_24
              pnpm
              zstd
            ];
            dontConfigure = true;
            dontBuild = true;
            installPhase = ''
              runHook preInstall

              export HOME="$TMPDIR/home"
              export npm_config_cache="$TMPDIR/npm-cache"
              export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
              export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=1
              export PUPPETEER_SKIP_DOWNLOAD=1
              export npm_config_manage_package_manager_versions=false

              mkdir -p "$HOME" "$TMPDIR/pnpm-store"
              tar --zstd -xf ${pnpmDeps}/pnpm-store.tar.zst -C "$TMPDIR/pnpm-store"
              chmod -R u+w "$TMPDIR/pnpm-store"

              pnpm config set store-dir "$TMPDIR/pnpm-store"
              pnpm config set package-import-method copy
              pnpm install --offline --frozen-lockfile --ignore-scripts

              mkdir -p "$out"
              find node_modules packages e2e -name node_modules -prune -print \
                | LC_ALL=C sort \
                | tar --zstd --sort=name --mtime='@1' --owner=0 --group=0 --numeric-owner \
                    -cf "$out/node_modules.tar.zst" --files-from=-

              runHook postInstall
            '';
          };
          rustToolchain = (pkgs.rust-bin.fromRustupToolchainFile
            ./rust-toolchain).override {
            # For rust-analyzer
            extensions = [ "rust-src" ];
            # For building wasm
            targets = [ "wasm32-unknown-unknown" ];
          };
          localNodeEnv = ''
            export PATH=$PWD/node_modules/.bin:$PATH
            unset PLAYWRIGHT_BROWSERS_PATH
            unset PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS
          '';
          playwrightEnv = localNodeEnv + ''
            export PLAYWRIGHT_BROWSERS_PATH=${pkgs.playwright-driver.browsers}
            export PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=true
            pwNixVersion=${pkgs.playwright-driver.version}
            pwNpmVersion=$(${pkgs.jq}/bin/jq -r .version node_modules/@playwright/test/package.json 2>/dev/null)
            if [ -n "$pwNpmVersion" ] && [ "$pwNpmVersion" != "$pwNixVersion" ]; then
              echo "!!! Playwright version mismatch: $pwNpmVersion (nodejs) != $pwNixVersion (nix). Please fix." >&2
            fi
          '';
          mkNodeShell = { nodejs, corepack, withPlaywright ? false, extraInputs ? [ ] }:
            pkgs.mkShell {
              nativeBuildInputs = with pkgs; [
                bashInteractive
                gitMinimal
                gnutar
                jq
                tree
                zstd

                nodejs
                corepack
              ] ++ pkgs.lib.optionals withPlaywright [
                # Playwright for the end-to-end tests
                pkgs.playwright-driver.browsers
              ] ++ extraInputs;
              shellHook = if withPlaywright then playwrightEnv else localNodeEnv;
            };
        in
        {
          packages = {
            pnpm-deps = pnpmDeps;
            node-modules = nodeModules;
          };
          devShells = {
            default = mkNodeShell {
              nodejs = pkgs.nodejs_24;
              corepack = pkgs.corepack_24;
              withPlaywright = true;
              extraInputs = with pkgs; [
                # Qwik optimizer deps
                wasm-pack
                # Provides rustc and cargo
                rustToolchain
              ];
            };
            ci-node24 = mkNodeShell {
              nodejs = pkgs.nodejs_24;
              corepack = pkgs.corepack_24;
            };
            ci-node24-e2e = mkNodeShell {
              nodejs = pkgs.nodejs_24;
              corepack = pkgs.corepack_24;
              withPlaywright = true;
            };
            ci-node22-e2e = mkNodeShell {
              nodejs = pkgs.nodejs_22;
              corepack = pkgs.corepack_22;
              withPlaywright = true;
            };
            ci-rust = mkNodeShell {
              nodejs = pkgs.nodejs_24;
              corepack = pkgs.corepack_24;
              extraInputs = with pkgs; [
                # Qwik optimizer deps
                wasm-pack
                # Provides rustc and cargo
                rustToolchain
              ];
            };
          };
        };
    in
    {
      packages = b.mapAttrs (system: pkgs: (perSystem system pkgs).packages) nixpkgs.legacyPackages;
      devShells = b.mapAttrs (system: pkgs: (perSystem system pkgs).devShells) nixpkgs.legacyPackages;
    };
}
