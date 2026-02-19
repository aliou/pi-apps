# Release metadata. Update rev and hashes after each CI release.
# To get the hash for a release asset:
#   nix-prefetch-url <url>
#   nix hash convert --hash-algo sha256 --to sri <hash>
{
  # Short commit SHA matching the GitHub release tag.
  rev = "0000000"; # Update after first release

  # Update after first release. Build will fail loudly with hash mismatch.
  relay.aarch64-linux.hash = "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
  gondolin-assets.aarch64-linux.hash = "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
}
