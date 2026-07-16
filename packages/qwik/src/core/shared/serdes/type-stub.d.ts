/** Minimal type-stub for the types in `Temporal`. Contains methods required for (de-)serializing. */
declare class __TemporalStub<T> {
  static from(item: string): T;
  toJSON(): string;
}

/** Type-Stub for the types in `Temporal` */
declare namespace Temporal {
  class Duration extends __TemporalStub<Duration> {}
  class Instant extends __TemporalStub<Instant> {}
  class PlainDate extends __TemporalStub<PlainDate> {}
  class PlainDateTime extends __TemporalStub<PlainDateTime> {}
  class PlainMonthDay extends __TemporalStub<PlainMonthDay> {}
  class PlainTime extends __TemporalStub<PlainTime> {}
  class PlainYearMonth extends __TemporalStub<PlainTime> {}
  class ZonedDateTime extends __TemporalStub<ZonedDateTime> {}
}
