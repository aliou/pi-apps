# Pi Apps packages built from CI release tarballs.
# These are pre-built artifacts (esbuild bundle + native node_modules).
{
  pkgs,
  system,
}: let
  release = import ./release.nix;
  owner = "aliou";
  repo = "pi-apps";
  baseUrl = "https://github.com/${owner}/${repo}/releases/download/${release.rev}";
in {
  relay = pkgs.stdenv.mkDerivation {
    pname = "pi-relay";
    version = release.rev;

    src = pkgs.fetchurl {
      url = "${baseUrl}/pi-relay-aarch64-linux.tar.gz";
      hash = release.relay.${system}.hash;
    };

    # Tarball contains dist/, node_modules/, package.json at the root.
    unpackPhase = ''
      mkdir -p source
      tar xzf $src -C source
    '';
    sourceRoot = "source";

    nativeBuildInputs = [pkgs.makeWrapper];

    installPhase = ''
      runHook preInstall

      mkdir -p $out/lib/pi-relay $out/bin
      cp -r dist node_modules package.json $out/lib/pi-relay/

      makeWrapper ${pkgs.nodejs_22}/bin/node $out/bin/pi-relay \
        --add-flags "$out/lib/pi-relay/dist/index.js"

      runHook postInstall
    '';

    meta = {
      description = "Pi Relay Server";
      platforms = ["aarch64-linux"];
    };
  };

  gondolin-assets = pkgs.stdenv.mkDerivation {
    pname = "pi-relay-gondolin-assets";
    version = release.rev;

    src = pkgs.fetchurl {
      url = "${baseUrl}/gondolin-assets-aarch64-linux.tar.gz";
      hash = release.gondolin-assets.${system}.hash;
    };

    # Tarball contains manifest.json, vmlinuz-virt, initramfs.cpio.lz4, rootfs.ext4.
    unpackPhase = ''
      mkdir -p source
      tar xzf $src -C source
    '';
    sourceRoot = "source";

    installPhase = ''
      runHook preInstall

      mkdir -p $out
      cp -r . $out/

      runHook postInstall
    '';

    meta = {
      description = "Gondolin guest assets for Pi Relay";
      platforms = ["aarch64-linux"];
    };
  };

  # fetchurl returns a store path that IS the file, which is what
  # virtualisation.oci-containers.containers.*.imageFile expects.
  dashboard-oci = pkgs.fetchurl {
    url = "${baseUrl}/pi-dashboard-oci.tar.gz";
    hash = release.dashboard-oci.${system}.hash;
  };
}
