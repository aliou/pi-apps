'use strict';

import { fileURLToPath, pathToFileURL, URL } from 'node:url';

const Module = require('module') as typeof import('module') & {
  registerHooks?: (hooks: Record<string, unknown>) => void;
};

// Internal module shims for Node.js VFS polyfill

// UV error code to name mapping
const uvErrorNames: Record<number, [string, string]> = {
  [-2]: ['ENOENT', 'no such file or directory'],
  [-20]: ['ENOTDIR', 'not a directory'],
  [-21]: ['EISDIR', 'is a directory'],
  [-39]: ['ENOTEMPTY', 'directory not empty'],
  [-9]: ['EBADF', 'bad file descriptor'],
  [-17]: ['EEXIST', 'file already exists'],
  [-30]: ['EROFS', 'read-only file system'],
  [-22]: ['EINVAL', 'invalid argument'],
  [-40]: ['ELOOP', 'too many symbolic links'],
};

class UVException extends Error {
  errno: number;
  code: string;
  syscall: string;
  path?: string;
  dest?: string;

  constructor({ errno, syscall, path, dest, message }: {
    errno: number;
    syscall: string;
    path?: string;
    dest?: string;
    message?: string;
  }) {
    const [code, desc] = uvErrorNames[errno] || ['UNKNOWN', 'unknown error'];
    let msg = message || `${code}: ${desc}, ${syscall}`;
    if (path) msg += ` '${path}'`;
    if (dest) msg += ` -> '${dest}'`;
    super(msg);
    this.errno = errno;
    this.code = code;
    this.syscall = syscall;
    if (path) this.path = path;
    if (dest) this.dest = dest;
  }
}

class ERR_METHOD_NOT_IMPLEMENTED extends Error {
  code = 'ERR_METHOD_NOT_IMPLEMENTED';
  constructor(method: string) {
    super(`Method '${method}' is not implemented`);
  }
}

class ERR_INVALID_STATE extends Error {
  code = 'ERR_INVALID_STATE';
  constructor(msg: string) {
    super(`Invalid state: ${msg}`);
  }
}

class ERR_INVALID_ARG_VALUE extends TypeError {
  code = 'ERR_INVALID_ARG_VALUE';
  constructor(name: string, value: unknown, reason: string) {
    super(`The argument '${name}' ${reason}. Received ${String(value)}`);
  }
}

class ERR_INVALID_ARG_TYPE extends TypeError {
  code = 'ERR_INVALID_ARG_TYPE';
  constructor(name: string, expected: string, actual: unknown) {
    super(`The "${name}" argument must be of type ${expected}. Received ${typeof actual}`);
  }
}

// Stats class for fs operations
const S_IFMT = 0o170000,
  S_IFREG = 0o100000,
  S_IFDIR = 0o040000,
  S_IFLNK = 0o120000;

class Stats {
  dev!: number;
  mode!: number;
  nlink!: number;
  uid!: number;
  gid!: number;
  rdev!: number;
  blksize!: number;
  ino!: number;
  size!: number;
  blocks!: number;
  atimeMs!: number;
  mtimeMs!: number;
  ctimeMs!: number;
  birthtimeMs!: number;
  atime!: Date;
  mtime!: Date;
  ctime!: Date;
  birthtime!: Date;

  constructor(
    dev: number,
    mode: number,
    nlink: number,
    uid: number,
    gid: number,
    rdev: number,
    blksize: number,
    ino: number,
    size: number,
    blocks: number,
    atimeMs: number,
    mtimeMs: number,
    ctimeMs: number,
    birthtimeMs: number
  ) {
    Object.assign(this, {
      dev,
      mode,
      nlink,
      uid,
      gid,
      rdev,
      blksize,
      ino,
      size,
      blocks,
      atimeMs,
      mtimeMs,
      ctimeMs,
      birthtimeMs,
    });
    this.atime = new Date(atimeMs);
    this.mtime = new Date(mtimeMs);
    this.ctime = new Date(ctimeMs);
    this.birthtime = new Date(birthtimeMs);
  }

  isFile() {
    return (this.mode & S_IFMT) === S_IFREG;
  }

  isDirectory() {
    return (this.mode & S_IFMT) === S_IFDIR;
  }

  isSymbolicLink() {
    return (this.mode & S_IFMT) === S_IFLNK;
  }

  isBlockDevice() {
    return false;
  }

  isCharacterDevice() {
    return false;
  }

  isFIFO() {
    return false;
  }

  isSocket() {
    return false;
  }
}

function getStatsFromBinding(b: Float64Array) {
  return new Stats(
    b[0],
    b[1],
    b[2],
    b[3],
    b[4],
    b[5],
    b[6],
    b[7],
    b[8],
    b[9],
    b[10] * 1000 + b[11] / 1e6,
    b[12] * 1000 + b[13] / 1e6,
    b[14] * 1000 + b[15] / 1e6,
    b[16] * 1000 + b[17] / 1e6
  );
}

class Dirent {
  name: string;
  parentPath: string | undefined;
  path: string | undefined;
  _type: number;

  constructor(name: string, type: number, parentPath?: string) {
    this.name = name;
    this.parentPath = parentPath;
    this.path = parentPath;
    this._type = type;
  }

  isFile() {
    return this._type === 1;
  }

  isDirectory() {
    return this._type === 2;
  }

  isSymbolicLink() {
    return this._type === 3;
  }

  isBlockDevice() {
    return false;
  }

  isCharacterDevice() {
    return false;
  }

  isFIFO() {
    return false;
  }

  isSocket() {
    return false;
  }
}

if (!Module.registerHooks) {
  (Module as { registerHooks: (hooks: Record<string, unknown>) => unknown }).registerHooks = () => ({
    resolve: () => undefined,
    load: () => undefined,
  });
}

const internalUrl = {
  URL,
  pathToFileURL,
  fileURLToPath,
  isURL(value: unknown): value is URL {
    return value instanceof URL;
  },
  toPathIfFileURL(value: string | URL) {
    return value instanceof URL ? fileURLToPath(value) : value;
  },
};

const internalModules = {
  'internal/errors': {
    UVException,
    codes: {
      ERR_METHOD_NOT_IMPLEMENTED,
      ERR_INVALID_STATE,
      ERR_INVALID_ARG_VALUE,
      ERR_INVALID_ARG_TYPE,
    },
  },

  'internal/validators': {
    validateBoolean(value: unknown, name: string) {
      if (typeof value !== 'boolean') {
        throw new ERR_INVALID_ARG_TYPE(name, 'boolean', value);
      }
    },
    validateObject(value: unknown, name: string) {
      if (value === null || typeof value !== 'object') {
        throw new ERR_INVALID_ARG_TYPE(name, 'object', value);
      }
    },
  },

  'internal/util': {
    kEmptyObject: Object.freeze({ __proto__: null }) as unknown as Record<string, never>,
    emitExperimentalWarning() {},
    getLazy<T>(fn: () => T) {
      let v: T;
      let done = false;
      return () => (done ? v : ((done = true), (v = fn())));
    },
  },

  'internal/url': internalUrl,

  'internal/fs/utils': {
    Stats,
    getStatsFromBinding,
    Dirent,
  },

  'internal/modules/cjs/loader': {
    Module,
  },
};

export default internalModules;
