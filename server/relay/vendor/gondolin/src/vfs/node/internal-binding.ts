'use strict';

// internalBinding shim - native bindings used by Node.js internals

const bindings = {
  uv: {
    UV_ENOENT: -2,
    UV_ENOTDIR: -20,
    UV_EISDIR: -21,
    UV_ENOTEMPTY: -39,
    UV_EBADF: -9,
    UV_EEXIST: -17,
    UV_EROFS: -30,
    UV_EINVAL: -22,
    UV_ELOOP: -40,
  },
  constants: {
    fs: {
      S_IFMT: 0o170000,
      S_IFREG: 0o100000,
      S_IFDIR: 0o040000,
      S_IFLNK: 0o120000,
      UV_DIRENT_UNKNOWN: 0,
      UV_DIRENT_FILE: 1,
      UV_DIRENT_DIR: 2,
      UV_DIRENT_LINK: 3,
    },
  },
  sea: {
    isSea: () => false,
    getAsset: () => {
      throw new Error('Not a SEA');
    },
    getAssetKeys: () => [],
  },
};

function internalBinding(name: keyof typeof bindings) {
  if (!bindings[name]) throw new Error(`No such binding: ${name}`);
  return bindings[name];
}

export default internalBinding;
