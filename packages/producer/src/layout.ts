export const TRADE_UPDATE_I32_FIELD_COUNT = 7;

export const FIELD_OFFSETS = {
  instrumentIndex: 0,
  priceCents: 1,
  tradeQty: 2,
  bidCents: 3,
  askCents: 4,
  bidQty: 5,
  askQty: 6,
} as const;

export const MIN_INSTRUMENTS = 1;
export const MAX_INSTRUMENTS = 50;
export const MIN_BATCH = 1;
export const MAX_BATCH = 1000;

export const ProducerErrorCode = {
  InstrumentCount: -1,
  BatchSize: -2,
  NotInitialized: -3,
  InstrumentIndex: -4,
  MidPriceRange: -5,
  Seed: -6,
} as const;
export type ProducerErrorCode = (typeof ProducerErrorCode)[keyof typeof ProducerErrorCode];

export const TICKERS: readonly string[] = Object.freeze([
  "ALFA", "BETA", "GAMA", "DLTA", "EPSI", "ZETA", "ETAX", "THTA", "IOTA", "KAPA",
  "LMDA", "MUON", "NUXI", "OMCR", "PIXL", "RHOX", "SIGM", "TAUX", "UPSL", "PHIX",
  "CHIX", "PSIX", "OMGA", "BRVO", "CHRL", "ECHX", "FXTR", "GOLX", "HTEL", "INDA",
  "JLTT", "KILX", "LIMX", "MIKX", "NOVR", "OSCR", "PAPX", "QBEC", "ROMX", "SIRA",
  "TNGO", "UNFM", "VCTR", "WHSK", "XRAY", "YNKE", "ZULX", "ORBX", "QUAZ", "VELX",
]);
