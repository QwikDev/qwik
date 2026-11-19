# Everything CI builds, as derivations. A derivation's hash covers exactly the files in its
# `fileset` plus its dependencies, so "does this need to run?" is "is this output cached?".
{ pkgs }:
let
  inherit (pkgs) lib;
  fs = lib.fileset;
  root = ../.;
  nodejs_24 = pkgs.nodejs_24;

  # stdenv leaves a build without certificates; the ones that reach the network need them.
  certificates = lib.genAttrs [
    "NIX_SSL_CERT_FILE"
    "SSL_CERT_FILE"
  ] (_: "${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt");

  readManifest = dir: lib.importJSON (root + "/${dir}/package.json");

  # The exact pnpm that `packageManager` pins, verified by the hash in that same field.
  pnpm =
    let
      pin = builtins.match "pnpm@([^+]+)\\+sha512\\.(.+)" (readManifest ".").packageManager;
      version = builtins.elemAt pin 0;
      tarball = pkgs.fetchurl {
        url = "https://registry.npmjs.org/pnpm/-/pnpm-${version}.tgz";
        sha512 = builtins.elemAt pin 1;
      };
    in
    pkgs.runCommand "pnpm-${version}" { } ''
      mkdir -p $out/lib $out/bin
      tar xzf ${tarball} -C $out/lib
      printf '#!/bin/sh\nexec node %s "$@"\n' $out/lib/package/bin/pnpm.mjs > $out/bin/pnpm
      chmod +x $out/bin/pnpm
    '';

  # Keep in sync with `packages:` in pnpm-workspace.yaml.
  workspaceParents = [
    "packages"
    "e2e"
  ];
  workspaceDirs = [
    "."
  ]
  ++ lib.concatMap (
    parent:
    lib.pipe (builtins.readDir (root + "/${parent}")) [
      (lib.filterAttrs (
        name: type: type == "directory" && builtins.pathExists (root + "/${parent}/${name}/package.json")
      ))
      lib.attrNames
      (map (name: "${parent}/${name}"))
    ]
  ) workspaceParents;

  # Only the manifest fields `pnpm install` reads, so editing a script doesn't reinstall.
  installFields = [
    "name"
    "version"
    "bin"
    "dependencies"
    "devDependencies"
    "optionalDependencies"
    "peerDependencies"
    "peerDependenciesMeta"
    "dependenciesMeta"
    "publishConfig"
    "engines"
    "packageManager"
  ];
  installManifests = pkgs.linkFarm "qwik-install-manifests" (
    map (dir: {
      name = lib.removePrefix "./" "${dir}/package.json";
      path = pkgs.writeText "package.json" (
        builtins.toJSON (
          lib.getAttrs (lib.intersectLists installFields (lib.attrNames (readManifest dir))) (
            readManifest dir
          )
        )
      );
    }) workspaceDirs
  );
  # pnpm only links a workspace bin whose target exists; the real file arrives with the build.
  workspaceBins = lib.concatMap (
    dir:
    let
      bin = (readManifest dir).bin or { };
    in
    map (target: "${dir}/${target}") (if lib.isString bin then [ bin ] else lib.attrValues bin)
  ) workspaceDirs;

  # Every `node_modules` of the workspace, at its path relative to the repo root.
  # Not a pure build: it is whatever `pnpm install` fetched, keyed by the lockfile and manifests.
  nodeModules = pkgs.stdenvNoCC.mkDerivation {
    name = "qwik-node-modules";
    # Network access, which needs `sandbox = relaxed` in nix.conf.
    __noChroot = true;
    src = fs.toSource {
      inherit root;
      fileset = fs.unions [
        (root + "/pnpm-lock.yaml")
        (root + "/pnpm-workspace.yaml")
        (root + "/patches")
      ];
    };
    nativeBuildInputs = [
      nodejs_24
      pnpm
    ];
    env = certificates;
    dontFixup = true;
    buildPhase = ''
      export HOME=$TMPDIR/home
      cp -rL --no-preserve=mode ${installManifests}/. .
      for bin in ${toString workspaceBins}; do
        mkdir -p "$(dirname "$bin")"
        touch "$bin"
      done
      pnpm install --frozen-lockfile --store-dir "$TMPDIR/pnpm-store"
    '';
    installPhase = ''
      find . -name node_modules -prune | while read -r dir; do
        mkdir -p "$out/$(dirname "$dir")"
        mv "$dir" "$out/$dir"
      done
    '';
  };

  # Runs `command` in a checkout of `fileset` that has node_modules and the outputs of `deps`
  # in place, and keeps the `outputs` paths. Outputs mirror the repo layout, so they stack.
  mkBuild =
    {
      name,
      fileset,
      command,
      outputs ? [ ],
      deps ? [ ],
      nativeBuildInputs ? [ ],
      env ? { },
      nodejs ? nodejs_24,
      # Like node_modules: reaches the network, so it needs `sandbox = relaxed`.
      network ? false,
    }:
    pkgs.stdenvNoCC.mkDerivation {
      inherit name;
      __noChroot = network;
      src = fs.toSource { inherit root fileset; };
      nativeBuildInputs = [
        nodejs
        pnpm
      ]
      ++ nativeBuildInputs;
      env = {
        CI = "true";
      }
      // lib.optionalAttrs network certificates
      // env;
      dontFixup = true;
      configurePhase = ''
        export HOME=$TMPDIR/home
        for dep in ${toString ([ nodeModules ] ++ deps)}; do
          cp -a $dep/. .
          chmod -R u+w .
        done
        export PATH=$PWD/node_modules/.bin:$PATH
      '';
      buildPhase = command;
      installPhase = ''
        mkdir -p $out
        for path in ${toString outputs}; do
          mkdir -p "$out/$(dirname "$path")"
          cp -a "$path" "$out/$path"
        done
      '';
    };

  without = suffixes: fs.fileFilter (file: !lib.any (suffix: lib.hasInfix suffix file.name) suffixes);
  repoFiles = paths: fs.unions (map (path: root + "/${path}") paths);

  # What `pnpm build` itself needs, whatever it builds.
  buildScripts = repoFiles [
    "package.json"
    "pnpm-workspace.yaml"
    "tsconfig.json"
    "scripts"
  ];
  qwikSources = repoFiles [
    "packages/qwik"
    "packages/qwik-vite"
    "packages/ts-optimizer"
    "packages/optimizer"
    "packages/qwik-dom"
    "packages/create-qwik/src/helpers/jokes.ts"
    "packages/create-qwik/src/helpers/jokes.json"
    "starters/features"
    "starters/adapters"
    "starters/templates"
  ];
  packageSources = repoFiles [
    "packages/qwik-router"
    "packages/qwik-react"
    "packages/qwik-utils"
    "packages/eslint-plugin-qwik"
    "packages/create-qwik"
    "packages/devtools"
    "packages/mcp"
    "packages/supabase-auth-helpers-qwik"
    "packages/docs/scripts/generate-llms.ts"
    "packages/docs/src/routes"
    "packages/docs/src/components/glossary"
    "starters"
    "e2e/qwik-e2e/apps"
    "@types"
    "types.d.ts"
    # The devtools build lints itself.
    "eslint.config.mjs"
    "eslint-rules"
  ];
  notTests = without [
    ".unit."
    ".rs"
  ] root;
  # Sources of the published packages. Whatever uses the built packages also reads these
  # (manifests, bins), so it lists them next to its own files.
  librarySources = fs.intersection notTests (
    fs.unions [
      buildScripts
      qwikSources
      packageSources
    ]
  );

  rustToolchain = (pkgs.rust-bin.fromRustupToolchainFile (root + "/rust-toolchain")).override {
    targets = [ "wasm32-unknown-unknown" ];
  };
  cargoConfig = pkgs.writeText "cargo-config.toml" ''
    [source.crates-io]
    replace-with = "vendored"
    [source.vendored]
    directory = "${pkgs.rustPlatform.importCargoLock { lockFile = root + "/Cargo.lock"; }}"
  '';

  # The Rust optimizer: linted, tested, then built as this platform's native binding and as wasm.
  # shortcut: recompiles every crate when a Rust file changes; adopt crane if that gets slow.
  optimizerBindings = mkBuild {
    name = "qwik-optimizer";
    fileset = fs.union buildScripts (repoFiles [
      "Cargo.toml"
      "Cargo.lock"
      "Makefile"
      "rust-toolchain"
      "rustfmt.toml"
      "packages/optimizer"
      # The build stamps the version it reads from here.
      "packages/qwik/package.json"
    ]);
    nativeBuildInputs = [
      rustToolchain
      pkgs.stdenv.cc
      pkgs.gnumake
      pkgs.wasm-pack
      # Must be the wasm-bindgen version in Cargo.lock.
      pkgs.wasm-bindgen-cli_0_2_100
    ];
    command = ''
      export CARGO_HOME=$TMPDIR/cargo
      install -D ${cargoConfig} $CARGO_HOME/config.toml
      pnpm lint.rust
      pnpm test.rust
      pnpm build --platform-binding --wasm
    '';
    outputs = [ "packages/optimizer/bindings" ];
  };

  # Whether pnpm would still resolve the lockfile the same way; asks the registry.
  dedupe = nodeModules.overrideAttrs {
    name = "qwik-dedupe-check";
    installPhase = ''
      pnpm --config.platform=linux --config.arch=x64 dedupe --check
      mkdir $out
    '';
  };

  # The sandbox has no system fonts, and without any the browsers lay text out as empty.
  fonts = pkgs.makeFontsConf {
    fontDirectories = [
      pkgs.liberation_ttf
      pkgs.dejavu_fonts
    ];
  };
  # The browsers of the Playwright version that package.json pins (syncpack keeps them equal).
  playwright = browser: {
    PLAYWRIGHT_BROWSERS_PATH = "${pkgs.playwright-driver.browsers.override {
      fontconfig_file = fonts;
      withFirefox = browser == "firefox";
      withWebkit = browser == "webkit";
    }}";
    PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "true";
    FONTCONFIG_FILE = "${fonts}";
    # The Playwright configs take their CI timeouts and tracing from this.
    GITHUB_ACTIONS = "true";
  };

  # Everything below depends on the version stamp: `dev` for ordinary builds, `latest` for releases.
  forDistTag =
    distTag:
    let
      qwik = mkBuild {
        name = "qwik";
        fileset = fs.intersection notTests (fs.union buildScripts qwikSources);
        command = "pnpm build --qwik --optimizer --insights --set-dist-tag=${distTag}";
        outputs = [
          "packages/qwik/dist"
          "packages/optimizer/dist"
        ];
      };

      # Router, React, utils, ESLint plugin, CLI, devtools and MCP, plus the repo-wide type check.
      qwikPackages = mkBuild {
        name = "qwik-packages";
        fileset = librarySources;
        deps = [ qwik ];
        command = "pnpm build --tsc --api --qwikrouter --cli --qwikreact --qwikutils --eslint --devtools --mcp --set-dist-tag=${distTag}";
        outputs = [
          "packages/qwik-router/lib"
          "packages/qwik-react/lib"
          "packages/qwik-utils/lib"
          "packages/eslint-plugin-qwik/dist"
          "packages/create-qwik/dist"
          "packages/devtools/dist"
          "packages/mcp/dist"
        ];
      };

      libraries = [
        qwik
        qwikPackages
      ];
      # A build or test on top of the built packages.
      mkConsumer =
        args:
        mkBuild (
          args
          // {
            fileset = fs.union librarySources args.fileset;
            deps = libraries ++ args.deps or [ ];
          }
        );

      # The docs and Insights apps fetch their live bundling strategy from Qwik Insights while building.
      docs = mkConsumer {
        name = "qwik-docs";
        network = true;
        fileset = repoFiles [ "packages/docs" ];
        command = "pnpm build --tsc-docs && pnpm build.packages.docs";
        outputs = [
          "packages/docs/dist"
          "packages/docs/server"
        ];
      };

      insights = mkConsumer {
        name = "qwik-insights";
        network = true;
        fileset = repoFiles [ "packages/insights" ];
        env.WRANGLER_SEND_METRICS = "false";
        command = "pnpm build.packages.insights && pnpm -C packages/insights run deploy.dry-run";
        outputs = [
          "packages/insights/dist"
          "packages/insights/server"
        ];
      };

      # Jobs on other platforms unpack this over a checkout.
      dist = pkgs.runCommand "qwik-dist" { } ''
        mkdir $out
        for dep in ${toString (libraries ++ [ optimizerBindings ])}; do
          cp -a $dep/. $out
          chmod -R u+w $out
        done
      '';

      unit = mkConsumer {
        name = "qwik-unit-tests";
        fileset = repoFiles [
          "packages"
          "vitest.config.ts"
          "vitest-setup.ts"
        ];
        # Some tests run the Rust optimizer.
        deps = [ optimizerBindings ];
        env = playwright "chromium";
        command = "pnpm test.unit && pnpm test.mcp";
      };

      bench = mkConsumer {
        name = "qwik-benchmarks";
        fileset = repoFiles [
          "packages/qwik"
          "vitest.config.ts"
          "vitest-setup.ts"
        ];
        command = "pnpm test.bench";
      };

      lint = mkBuild {
        name = "qwik-lint";
        # Prettier and ESLint read the whole repo.
        fileset = root;
        command = ''
          pnpm lint.syncpack
          pnpm lint.prettier
          pnpm build --eslint
          pnpm lint.eslint
        '';
      };

      e2eSources = repoFiles [
        "starters"
        "e2e"
      ];
      mkE2e =
        {
          optimizer ? "ts",
          browser ? "chromium",
          ...
        }@args:
        mkConsumer (
          removeAttrs args [
            "optimizer"
            "browser"
          ]
          // {
            nodejs = pkgs.nodejs_22;
            fileset = fs.union e2eSources (args.fileset or e2eSources);
            deps = args.deps or [ ] ++ lib.optional (optimizer == "rust") optimizerBindings;
            env = playwright browser // { QWIK_OPTIMIZER = optimizer; } // args.env or { };
          }
        );
      shards = total: lib.genList (index: "${toString (index + 1)}/${toString total}") total;
      shardName = lib.replaceStrings [ "/" ] [ "of" ];
      # One check per (variant, shard), named like `e2e-chromium-ts-1of2`.
      matrix =
        prefix: variants: total: mkCheck:
        lib.listToAttrs (
          lib.concatMap (
            variant:
            map (
              shard:
              let
                name = lib.concatStringsSep "-" ([ prefix ] ++ lib.attrValues variant ++ [ (shardName shard) ]);
              in
              lib.nameValuePair name (mkCheck variant shard "qwik-${name}")
            ) (shards total)
          ) variants
        );

      e2e =
        matrix "e2e"
          (lib.cartesianProduct {
            optimizer = [
              "ts"
              "rust"
            ];
            browser = [
              "chromium"
              "firefox"
            ];
          })
          2
          (
            { optimizer, browser }:
            shard: name:
            mkE2e {
              inherit optimizer browser name;
              command = "playwright test e2e/qwik-e2e/tests --browser=${browser} --config=e2e/qwik-e2e/playwright.config.ts --shard=${shard}";
            }
          );

      e2eDocs = matrix "e2e-docs" [ { } ] 2 (
        _: shard: name:
        mkE2e {
          inherit name;
          # The docs playground loads its editor from a CDN.
          network = true;
          fileset = repoFiles [ "packages/docs" ];
          deps = [ docs ];
          command = "playwright test --config=e2e/docs-e2e/playwright.config.ts --project=chromium --shard=${shard}";
        }
      );

      # Adapters on each runtime, with qwik-react and the CLI where today's matrix runs them.
      e2eAdapters =
        matrix "e2e-adapters"
          [
            {
              optimizer = "ts";
              runtime = "node";
            }
            {
              optimizer = "ts";
              runtime = "bun";
            }
            {
              optimizer = "ts";
              runtime = "deno";
            }
            {
              optimizer = "rust";
              runtime = "node";
            }
          ]
          2
          (
            { optimizer, runtime }:
            shard: name:
            let
              config = if runtime == "node" then "playwright.config.ts" else "playwright.${runtime}.config.ts";
              withCli = optimizer == "ts" && runtime == "node";
            in
            mkE2e {
              inherit optimizer name;
              nativeBuildInputs =
                lib.optional (runtime != "node") pkgs.${runtime}
                # The CLI tests stop their dev servers with `ps`.
                ++ lib.optional withCli pkgs.unixtools.ps;
              # The CLI tests install the projects they scaffold, which use the Rust optimizer.
              # Deno imports its standard library from deno.land.
              network = withCli || runtime == "deno";
              deps = lib.optional withCli optimizerBindings;
              command = ''
                playwright test e2e/adapters-e2e/tests --project=chromium --config=e2e/adapters-e2e/${config} --shard=${shard}
              ''
              + lib.optionalString (runtime == "node") ''
                playwright test e2e/qwik-react-e2e/tests --project=chromium --config=e2e/qwik-react-e2e/playwright.config.ts --shard=${shard}
              ''
              + lib.optionalString withCli ''
                # The scaffolded apps choose their own optimizer.
                env -u QWIK_OPTIMIZER pnpm --filter qwik-cli-e2e exec vitest run --config=vite.config.ts --shard=${shard}
              '';
            }
          );

      checks = {
        inherit
          unit
          bench
          lint
          dedupe
          insights
          ;
        e2e-preloader = mkE2e {
          name = "qwik-e2e-preloader";
          command = "pnpm test.e2e.preloader";
        };
      }
      // e2e
      // e2eDocs
      // e2eAdapters;
    in
    {
      inherit checks;
      packages = {
        inherit
          qwik
          docs
          dist
          ;
        optimizer = optimizerBindings;
        qwik-packages = qwikPackages;
        node-modules = nodeModules;
      };
    };
in
{
  inherit (forDistTag "dev") packages checks;
  # `nix build .#ci.<dist tag>.<packages|checks>.<name>`
  legacyPackages.ci = lib.genAttrs [
    "dev"
    "latest"
  ] forDistTag;
}
