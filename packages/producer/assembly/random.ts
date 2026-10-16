export function seedRandom(seed: i64): void {
  NativeMath.seedRandom(seed);
}

export function getRandomIntInRange(lo: i32, hi: i32): i32 {
  assert(lo <= hi, "getRandomIntInRange: lo must be <= hi");
  const range = <f64>hi - <f64>lo + 1;
  return lo + <i32>Math.floor(Math.random() * range);
}

export function getRandomIntLessThan(bound: i32): i32 {
  assert(bound >= 1, "getRandomIntLessThan: bound must be >= 1");
  return <i32>Math.floor(Math.random() * <f64>bound);
}

export function getRandomBool(): bool {
  return Math.random() < 0.5;
}
