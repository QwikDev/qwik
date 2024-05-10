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
      devShell = system: _pkgs:
        let
          overlays = [ (import rust-overlay) ];
          pkgs = import nixpkgs {
            inherit system overlays;
          };
        in
        {
          default = pkgs.mkShell {
            nativeBuildInputs = with pkgs; [
              bashInteractive
              gitMinimal

              nodejs_20
              corepack_20

              # Playwright for the end-to-end tests
              playwright-driver.browsers

              # Qwik optimizer deps
              wasm-pack
              # Provides rustc and cargo
              ((rust-bin.fromRustupToolchainFile
                ./rust-toolchain).override {
                # For rust-analyzer
                extensions = [ "rust-src" ];
                # For building wasm
                targets = [ "wasm32-unknown-unknown" ];
              })
            ];
            # https://github.com/microsoft/playwright/issues/5501
            shellHook = ''
              export PATH=$PWD/node_modules/.bin:$PATH
              export PLAYWRIGHT_BROWSERS_PATH=${pkgs.playwright-driver.browsers}
              export PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=true
              pwNixVersion=${pkgs.playwright-driver.version}
              pwNpmVersion=$(${pkgs.jq}/bin/jq -r .version node_modules/@playwright/test/package.json 2>/dev/null)
              if [ -n "$pwNpmVersion" ] && [ "$pwNpmVersion" != "$pwNixVersion" ]; then
                echo "!!! Playwright version mismatch: $pwNpmVersion (nodejs) != $pwNixVersion (nix). Please fix." >&2
              fi
            '';
          };
        };
    in
    {
      devShells = b.mapAttrs (devShell) nixpkgs.legacyPackages;
    };
}
