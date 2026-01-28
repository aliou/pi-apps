{
  description = "Pi Apps - Native Apple platform clients for Pi";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-parts.url = "github:hercules-ci/flake-parts";

    git-hooks-nix = {
      url = "github:cachix/git-hooks.nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    inputs@{ flake-parts, ... }:
    flake-parts.lib.mkFlake { inherit inputs; } {
      systems = [
        "aarch64-darwin"
        "x86_64-darwin"
      ];

      imports = [
        inputs.git-hooks-nix.flakeModule
      ];

      perSystem =
        { config, pkgs, ... }:
        let
          xcodeWrapper = pkgs.xcodeenv.composeXcodeWrapper {
            versions = [ ];
          };

          swiftlintWrapper = pkgs.writeShellScriptBin "swiftlint" ''
            export DYLD_FRAMEWORK_PATH="/Applications/Xcode.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/lib"
            export PATH="/Applications/Xcode.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/bin:$PATH"
            exec ${pkgs.swiftlint}/bin/swiftlint "$@"
          '';
          # Wrapper to run biome from apps/relay
          biomeWrapper = pkgs.writeShellScriptBin "biome-relay" ''
            cd "$PWD/apps/relay"
            exec ${pkgs.biome}/bin/biome "$@"
          '';

          # Wrapper to run typecheck from apps/relay
          # Skips if node_modules not installed (CI/fresh clone)
          typecheckWrapper = pkgs.writeShellScriptBin "typecheck-relay" ''
            cd "$PWD/apps/relay"
            if [ ! -d "node_modules" ]; then
              echo "Skipping typecheck: node_modules not installed"
              exit 0
            fi
            exec ${pkgs.pnpm}/bin/pnpm typecheck
          '';
        in
        {
          pre-commit.settings.hooks = {
            swiftlint = {
              enable = true;
              name = "swiftlint";
              description = "Lint Swift files";
              entry = "${swiftlintWrapper}/bin/swiftlint --strict --no-cache";
              files = "\\.swift$";
              language = "system";
            };
            biome-check = {
              enable = true;
              name = "biome-check";
              description = "Lint TypeScript/JavaScript files";
              entry = "${biomeWrapper}/bin/biome-relay check --no-errors-on-unmatched";
              files = "^apps/relay/.*\\.(ts|tsx|js|jsx|json)$";
              language = "system";
              pass_filenames = false;
            };
            biome-format = {
              enable = true;
              name = "biome-format";
              description = "Format TypeScript/JavaScript files";
              entry = "${biomeWrapper}/bin/biome-relay check --write --no-errors-on-unmatched";
              files = "^apps/relay/.*\\.(ts|tsx|js|jsx|json)$";
              language = "system";
              pass_filenames = false;
            };
            relay-typecheck = {
              enable = true;
              name = "relay-typecheck";
              description = "Type check relay app";
              entry = "${typecheckWrapper}/bin/typecheck-relay";
              files = "^apps/relay/.*\\.tsx?$";
              language = "system";
              pass_filenames = false;
            };
          };

          devShells.default = pkgs.mkShellNoCC {
            packages = [
              swiftlintWrapper
              pkgs.xcodegen
              pkgs.gnumake
              pkgs.nodejs_22
              pkgs.pnpm
              pkgs.biome
              pkgs.pre-commit
            ];

            shellHook = ''
              export PATH="${xcodeWrapper}/bin:$PATH"
              export DEVELOPER_DIR="/Applications/Xcode.app/Contents/Developer"
              export DYLD_FRAMEWORK_PATH="/Applications/Xcode.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/lib"
              export LD=/usr/bin/clang
              ${config.pre-commit.installationScript}

              # Local dev directories (isolated from system XDG)
              # This prevents dev from polluting ~/.local/share, ~/.config, etc.
              export PI_RELAY_DATA_DIR="$PWD/.dev/relay/data"
              export PI_RELAY_CONFIG_DIR="$PWD/.dev/relay/config"
              export PI_RELAY_CACHE_DIR="$PWD/.dev/relay/cache"
              export PI_RELAY_STATE_DIR="$PWD/.dev/relay/state"
              
              echo ""
              echo "Pi Apps Development Environment"
              echo "================================"
              echo ""
              echo "Desktop/Mobile (Swift):"
              echo "  make setup    - First-time setup"
              echo "  make xcode    - Open in Xcode"
              echo "  make build    - Build from command line"
              echo ""
              echo "Server (TypeScript/Node.js):"
              echo "  cd apps/server && pnpm install"
              echo "  pnpm run dev   - Run with hot reload"
              echo "  pnpm run build - Build for production"
              echo ""
              echo "Relay (dev dirs at .dev/relay/):"
              echo "  cd apps/relay && pnpm install"
              echo "  pnpm run dev   - Run with hot reload"
              echo ""
            '';
          };
        };
    };
}
