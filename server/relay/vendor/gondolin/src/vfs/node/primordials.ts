'use strict';

// Primordials shim - frozen built-in methods used by Node.js internals
// In userland this is just a passthrough to regular built-ins

const SymbolDispose = (Symbol as typeof Symbol & { dispose?: symbol }).dispose ?? Symbol.for('nodejs.dispose');

const primordials = {
  ArrayPrototypeIndexOf: (arr: unknown[], v: unknown) => arr.indexOf(v as never),
  ArrayPrototypePush: (arr: unknown[], ...v: unknown[]) => {
    for (const item of v) {
      (arr as unknown[]).push(item);
    }
    return (arr as unknown[]).length;
  },
  ArrayPrototypeSplice: (arr: unknown[], ...v: unknown[]) =>
    (Array.prototype.splice as (...args: any[]) => any).apply(arr as unknown[], v as unknown as any[]),
  Boolean,
  DateNow: Date.now,
  ErrorCaptureStackTrace: Error.captureStackTrace?.bind(Error) ?? (() => {}),
  Float64Array,
  FunctionPrototypeCall: (fn: Function, thisArg: unknown, ...args: unknown[]) => fn.call(thisArg, ...args),
  MathCeil: Math.ceil,
  MathFloor: Math.floor,
  MathMin: Math.min,
  ObjectDefineProperties: Object.defineProperties,
  ObjectDefineProperty: Object.defineProperty,
  ObjectFreeze: Object.freeze,
  Promise,
  PromiseResolve: Promise.resolve.bind(Promise),
  SafeMap: Map,
  SafeSet: Set,
  StringPrototypeEndsWith: (s: string, v: string) => s.endsWith(v),
  StringPrototypeLastIndexOf: (s: string, v: string) => s.lastIndexOf(v),
  StringPrototypeReplaceAll: (s: string, a: string, b: string) => s.split(a).join(b),
  StringPrototypeSlice: (s: string, a?: number, b?: number) => s.slice(a, b),
  StringPrototypeSplit: (s: string, d: string | RegExp) => s.split(d),
  StringPrototypeStartsWith: (s: string, v: string) => s.startsWith(v),
  Symbol,
  SymbolAsyncIterator: Symbol.asyncIterator,
  SymbolDispose,
};

export default primordials;
