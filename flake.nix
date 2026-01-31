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
            biome-check = {
              enable = true;
              name = "biome-check";
              description = "Lint and format TypeScript/JavaScript files";
              entry = "${pkgs.pnpm}/bin/pnpm exec biome check --no-errors-on-unmatched";
              files = "\\.(ts|tsx|js|jsx|json|mjs)$";
              language = "system";
              pass_filenames = false;
            };
            ts-typecheck = {
              enable = true;
              name = "ts-typecheck";
              description = "Type check TypeScript apps";
              entry = "${pkgs.pnpm}/bin/pnpm exec turbo typecheck";
              files = "\\.(ts|tsx)$";
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
              pkgs.websocat
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

              # Auto-detect Docker socket for Lima/colima
              if [ -z "''${DOCKER_HOST:-}" ]; then
                if [ -S "$HOME/.lima/default/sock/docker.sock" ]; then
                  export DOCKER_HOST="unix://$HOME/.lima/default/sock/docker.sock"
                elif [ -S "$HOME/.colima/default/docker.sock" ]; then
                  export DOCKER_HOST="unix://$HOME/.colima/default/docker.sock"
                fi
              fi

              echo ""
              echo "Pi Apps Development Environment"
              echo "================================"
              echo ""
              echo "Setup:"
              echo "  pnpm install  - Install all dependencies"
              echo "  make setup    - First-time Swift/Xcode setup"
              echo ""
              echo "Desktop/Mobile (Swift):"
              echo "  make xcode    - Open in Xcode"
              echo "  make build    - Build from command line"
              echo ""
              echo "TypeScript (monorepo):"
              echo "  pnpm dev      - Run all apps"
              echo "  pnpm build    - Build all apps"
              echo "  pnpm lint     - Lint all apps"
              echo "  pnpm test     - Test all apps"
              echo ""
            '';
          };
        };
    };
}
