{
  description = "Pi Apps - Clients for Pi";

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
        {
          config,
          pkgs,
          ...
        }:
        let
          xcodeWrapper = pkgs.xcodeenv.composeXcodeWrapper {
            versions = [ ];
          };

          swiftlintWrapper = pkgs.writeShellScriptBin "swiftlint" ''
            export DYLD_FRAMEWORK_PATH="/Applications/Xcode.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/lib"
            export PATH="/Applications/Xcode.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/bin:$PATH"
            exec ${pkgs.swiftlint}/bin/swiftlint "$@"
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
            biome-check-relay = {
              enable = true;
              name = "biome-check-relay";
              description = "Lint and format relay server TypeScript files";
              entry = "cd server/relay && ${pkgs.pnpm}/bin/pnpm exec biome check --write --no-errors-on-unmatched --staged";
              files = "^server/relay/.*\\.(ts|tsx|js|jsx|json|mjs)$";
              language = "system";
              pass_filenames = false;
            };
            biome-check-dashboard = {
              enable = true;
              name = "biome-check-dashboard";
              description = "Lint and format dashboard TypeScript files";
              entry = "cd clients/dashboard && ${pkgs.pnpm}/bin/pnpm exec biome check --write --no-errors-on-unmatched --staged";
              files = "^clients/dashboard/.*\\.(ts|tsx|js|jsx|json|mjs)$";
              language = "system";
              pass_filenames = false;
            };
            ts-typecheck-relay = {
              enable = true;
              name = "ts-typecheck-relay";
              description = "Type check relay server";
              entry = "cd server/relay && ${pkgs.pnpm}/bin/pnpm exec tsc --noEmit";
              files = "^server/relay/.*\\.(ts|tsx)$";
              language = "system";
              pass_filenames = false;
            };
            ts-typecheck-dashboard = {
              enable = true;
              name = "ts-typecheck-dashboard";
              description = "Type check dashboard";
              entry = "cd clients/dashboard && ${pkgs.pnpm}/bin/pnpm exec react-router typegen && ${pkgs.pnpm}/bin/pnpm exec tsc --noEmit";
              files = "^clients/dashboard/.*\\.(ts|tsx)$";
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
              pkgs.pre-commit
              pkgs.qemu
              # Gondolin custom image build requirements
              pkgs.zig
              pkgs.lz4
              pkgs.curl
              pkgs.python3
              pkgs.e2fsprogs
              pkgs.websocat
              pkgs.bun
            ];

            shellHook = ''
              export PATH="${xcodeWrapper}/bin:$PATH"
              export DEVELOPER_DIR="/Applications/Xcode.app/Contents/Developer"
              export DYLD_FRAMEWORK_PATH="/Applications/Xcode.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/lib"
              unset CC LD
              ${config.pre-commit.installationScript}

              # Local dev directories (isolated from system XDG)
              export PI_RELAY_DATA_DIR="$PWD/.dev/relay/data"
              export PI_RELAY_CONFIG_DIR="$PWD/.dev/relay/config"
              export PI_RELAY_CACHE_DIR="$PWD/.dev/relay/cache"
              export PI_RELAY_STATE_DIR="$PWD/.dev/relay/state"

              # Auto-detect Docker socket for Lima/colima
              if [ -z "''${DOCKER_HOST:-}" ]; then
                if [ -S "$HOME/.lima/default/sock/docker.sock" ]; then
                  export DOCKER_HOST="unix://$HOME/.lima/default/sock/docker.sock"
                elif [ -S "$HOME/.colima/default/docker.sock" ]; then
                  export DOCKER_HOST="unix://$HOME/.colima/default/docker.sock"
                fi
              fi

              # DOCKER_SOCK: socket path without unix:// prefix (for compose volumes)
              export DOCKER_SOCK="''${DOCKER_HOST#unix://}"

              echo ""
              echo "Pi Apps Development Environment"
              echo "================================"
              echo ""
              echo "Setup:"
              echo "  make setup              - First-time Swift/Xcode setup"
              echo "  cd server/relay && pnpm install"
              echo "  cd clients/dashboard && pnpm install"
              echo ""
              echo "Native (Swift):"
              echo "  make xcode              - Open in Xcode"
              echo "  make build              - Build from command line"
              echo ""
              echo "Relay Server:"
              echo "  cd server/relay"
              echo "  pnpm dev                - Run dev server (hot reload)"
              echo "  pnpm build              - Build"
              echo "  pnpm lint               - Lint (biome)"
              echo "  pnpm test               - Test (vitest)"
              echo ""
              echo "Dashboard:"
              echo "  cd clients/dashboard"
              echo "  pnpm dev                - Run dev server (hot reload)"
              echo "  pnpm build              - Build"
              echo ""
            '';
          };
        };
    };
}
