export class XorShift32 {
  private state: number;

  constructor(seed: number) {
    // Avoid the all-zero state
    this.state = (seed >>> 0) || 0x12345678;
  }

  nextU32(): number {
    // xorshift32
    let x = this.state >>> 0;
    x ^= (x << 13) >>> 0;
    x ^= (x >>> 17) >>> 0;
    x ^= (x << 5) >>> 0;
    this.state = x >>> 0;
    return this.state;
  }

  int(min: number, maxInclusive: number): number {
    if (!Number.isFinite(min) || !Number.isFinite(maxInclusive)) {
      throw new RangeError("min/max must be finite");
    }
    if (maxInclusive < min) {
      throw new RangeError("maxInclusive must be >= min");
    }
    const span = (maxInclusive - min + 1) >>> 0;
    // Modulo bias is fine for fuzzing.
    return min + (this.nextU32() % span);
  }

  bool(): boolean {
    return (this.nextU32() & 1) === 1;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error("pick from empty array");
    return items[this.int(0, items.length - 1)]!;
  }
}
