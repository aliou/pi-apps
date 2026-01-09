{
  description = "Pi Desktop App";

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

          # Wrapper script that sets up environment for swiftlint to find Xcode's SourceKit
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
            ];

            shellHook = ''
              export PATH="${xcodeWrapper}/bin:$PATH"
              export DEVELOPER_DIR="/Applications/Xcode.app/Contents/Developer"
              export DYLD_FRAMEWORK_PATH="/Applications/Xcode.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/lib"
              # Use system linker for Xcode builds
              export LD=/usr/bin/clang
              ${config.pre-commit.installationScript}
            '';
          };
        };
    };
}
