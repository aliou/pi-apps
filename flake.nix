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
          };

          devShells.default = pkgs.mkShellNoCC {
            packages = [
              swiftlintWrapper
              pkgs.xcodegen
              pkgs.gnumake
              pkgs.nodejs_22
              pkgs.pnpm
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
