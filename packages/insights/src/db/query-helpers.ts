import { sql } from 'drizzle-orm';
import { type EdgeRowSansId, edgeTable, type RouteRowSansId, routesTable } from './schema';
import { BUCKETS } from '~/stats/vector';

export type VectorKeys<PREFIX extends string> =
  | `${PREFIX}00`
  | `${PREFIX}01`
  | `${PREFIX}02`
  | `${PREFIX}03`
  | `${PREFIX}04`
  | `${PREFIX}05`
  | `${PREFIX}06`
  | `${PREFIX}07`
  | `${PREFIX}08`
  | `${PREFIX}09`
  | `${PREFIX}10`
  | `${PREFIX}11`
  | `${PREFIX}12`
  | `${PREFIX}13`
  | `${PREFIX}14`
  | `${PREFIX}15`
  | `${PREFIX}16`
  | `${PREFIX}17`
  | `${PREFIX}18`
  | `${PREFIX}19`
  | `${PREFIX}20`
  | `${PREFIX}21`
  | `${PREFIX}22`
  | `${PREFIX}23`
  | `${PREFIX}24`
  | `${PREFIX}25`
  | `${PREFIX}26`
  | `${PREFIX}27`
  | `${PREFIX}28`
  | `${PREFIX}29`
  | `${PREFIX}30`
  | `${PREFIX}31`
  | `${PREFIX}32`
  | `${PREFIX}33`
  | `${PREFIX}34`
  | `${PREFIX}35`
  | `${PREFIX}36`
  | `${PREFIX}37`
  | `${PREFIX}38`
  | `${PREFIX}39`
  | `${PREFIX}40`
  | `${PREFIX}41`
  | `${PREFIX}42`
  | `${PREFIX}43`
  | `${PREFIX}44`
  | `${PREFIX}45`
  | `${PREFIX}46`
  | `${PREFIX}47`
  | `${PREFIX}48`
  | `${PREFIX}49`;
export type VectorFields<PREFIX extends string> = Record<VectorKeys<PREFIX>, number>;

export function latencyBucketField(bucket: number): VectorKeys<`latencyCount`> {
  return ('latencyCount' + pad(bucket)) as any;
}

export function delayBucketField(bucket: number): VectorKeys<`delayCount`> {
  return ('delayCount' + pad(bucket)) as any;
}

function pad(value: number): VectorKeys<''> {
  return value < 10 ? '0' + value : (String(value) as any);
}

export function createEdgeRow({
  publicApiKey,
  manifestHash,
  from,
  to,
  interaction,
}: {
  publicApiKey: string;
  manifestHash: string;
  from?: string | null;
  to: string;
  interaction: boolean;
  delayBucket: number;
  latencyBucket: number;
}): EdgeRowSansId {
  return {
    publicApiKey,
    manifestHash,
    from,
    to,
    interaction: interaction ? 0 : 1,
    delayCount00: 0,
    delayCount01: 0,
    delayCount02: 0,
    delayCount03: 0,
    delayCount04: 0,
    delayCount05: 0,
    delayCount06: 0,
    delayCount07: 0,
    delayCount08: 0,
    delayCount09: 0,
    delayCount10: 0,
    delayCount11: 0,
    delayCount12: 0,
    delayCount13: 0,
    delayCount14: 0,
    delayCount15: 0,
    delayCount16: 0,
    delayCount17: 0,
    delayCount18: 0,
    delayCount19: 0,
    delayCount20: 0,
    delayCount21: 0,
    delayCount22: 0,
    delayCount23: 0,
    delayCount24: 0,
    delayCount25: 0,
    delayCount26: 0,
    delayCount27: 0,
    delayCount28: 0,
    delayCount29: 0,
    delayCount30: 0,
    delayCount31: 0,
    delayCount32: 0,
    delayCount33: 0,
    delayCount34: 0,
    delayCount35: 0,
    delayCount36: 0,
    delayCount37: 0,
    delayCount38: 0,
    delayCount39: 0,
    delayCount40: 0,
    delayCount41: 0,
    delayCount42: 0,
    delayCount43: 0,
    delayCount44: 0,
    delayCount45: 0,
    delayCount46: 0,
    delayCount47: 0,
    delayCount48: 0,
    delayCount49: 0,
    latencyCount00: 0,
    latencyCount01: 0,
    latencyCount02: 0,
    latencyCount03: 0,
    latencyCount04: 0,
    latencyCount05: 0,
    latencyCount06: 0,
    latencyCount07: 0,
    latencyCount08: 0,
    latencyCount09: 0,
    latencyCount10: 0,
    latencyCount11: 0,
    latencyCount12: 0,
    latencyCount13: 0,
    latencyCount14: 0,
    latencyCount15: 0,
    latencyCount16: 0,
    latencyCount17: 0,
    latencyCount18: 0,
    latencyCount19: 0,
    latencyCount20: 0,
    latencyCount21: 0,
    latencyCount22: 0,
    latencyCount23: 0,
    latencyCount24: 0,
    latencyCount25: 0,
    latencyCount26: 0,
    latencyCount27: 0,
    latencyCount28: 0,
    latencyCount29: 0,
    latencyCount30: 0,
    latencyCount31: 0,
    latencyCount32: 0,
    latencyCount33: 0,
    latencyCount34: 0,
    latencyCount35: 0,
    latencyCount36: 0,
    latencyCount37: 0,
    latencyCount38: 0,
    latencyCount39: 0,
    latencyCount40: 0,
    latencyCount41: 0,
    latencyCount42: 0,
    latencyCount43: 0,
    latencyCount44: 0,
    latencyCount45: 0,
    latencyCount46: 0,
    latencyCount47: 0,
    latencyCount48: 0,
    latencyCount49: 0,
  };
}

export const edgeTableDelayCount = sql<number>`sum(
  ${edgeTable.delayCount00} +
  ${edgeTable.delayCount01} +
  ${edgeTable.delayCount02} +
  ${edgeTable.delayCount03} +
  ${edgeTable.delayCount04} +
  ${edgeTable.delayCount05} +
  ${edgeTable.delayCount06} +
  ${edgeTable.delayCount07} +
  ${edgeTable.delayCount08} +
  ${edgeTable.delayCount09} +
  ${edgeTable.delayCount10} +
  ${edgeTable.delayCount11} +
  ${edgeTable.delayCount12} +
  ${edgeTable.delayCount13} +
  ${edgeTable.delayCount14} +
  ${edgeTable.delayCount15} +
  ${edgeTable.delayCount16} +
  ${edgeTable.delayCount17} +
  ${edgeTable.delayCount18} +
  ${edgeTable.delayCount19} +
  ${edgeTable.delayCount20} +
  ${edgeTable.delayCount21} +
  ${edgeTable.delayCount22} +
  ${edgeTable.delayCount23} +
  ${edgeTable.delayCount24} +
  ${edgeTable.delayCount25} +
  ${edgeTable.delayCount26} +
  ${edgeTable.delayCount27} +
  ${edgeTable.delayCount28} +
  ${edgeTable.delayCount29} +
  ${edgeTable.delayCount30} +
  ${edgeTable.delayCount31} +
  ${edgeTable.delayCount32} +
  ${edgeTable.delayCount33} +
  ${edgeTable.delayCount34} +
  ${edgeTable.delayCount35} +
  ${edgeTable.delayCount36} +
  ${edgeTable.delayCount37} +
  ${edgeTable.delayCount38} +
  ${edgeTable.delayCount39} +
  ${edgeTable.delayCount40} +
  ${edgeTable.delayCount41} +
  ${edgeTable.delayCount42} +
  ${edgeTable.delayCount43} +
  ${edgeTable.delayCount44} +
  ${edgeTable.delayCount45} +
  ${edgeTable.delayCount46} +
  ${edgeTable.delayCount47} +
  ${edgeTable.delayCount48} +
  ${edgeTable.delayCount49} )`;

export const delayColumns = {
  delayCount00: edgeTable.delayCount00,
  delayCount01: edgeTable.delayCount01,
  delayCount02: edgeTable.delayCount02,
  delayCount03: edgeTable.delayCount03,
  delayCount04: edgeTable.delayCount04,
  delayCount05: edgeTable.delayCount05,
  delayCount06: edgeTable.delayCount06,
  delayCount07: edgeTable.delayCount07,
  delayCount08: edgeTable.delayCount08,
  delayCount09: edgeTable.delayCount09,
  delayCount10: edgeTable.delayCount10,
  delayCount11: edgeTable.delayCount11,
  delayCount12: edgeTable.delayCount12,
  delayCount13: edgeTable.delayCount13,
  delayCount14: edgeTable.delayCount14,
  delayCount15: edgeTable.delayCount15,
  delayCount16: edgeTable.delayCount16,
  delayCount17: edgeTable.delayCount17,
  delayCount18: edgeTable.delayCount18,
  delayCount19: edgeTable.delayCount19,
  delayCount20: edgeTable.delayCount20,
  delayCount21: edgeTable.delayCount21,
  delayCount22: edgeTable.delayCount22,
  delayCount23: edgeTable.delayCount23,
  delayCount24: edgeTable.delayCount24,
  delayCount25: edgeTable.delayCount25,
  delayCount26: edgeTable.delayCount26,
  delayCount27: edgeTable.delayCount27,
  delayCount28: edgeTable.delayCount28,
  delayCount29: edgeTable.delayCount29,
  delayCount30: edgeTable.delayCount30,
  delayCount31: edgeTable.delayCount31,
  delayCount32: edgeTable.delayCount32,
  delayCount33: edgeTable.delayCount33,
  delayCount34: edgeTable.delayCount34,
  delayCount35: edgeTable.delayCount35,
  delayCount36: edgeTable.delayCount36,
  delayCount37: edgeTable.delayCount37,
  delayCount38: edgeTable.delayCount38,
  delayCount39: edgeTable.delayCount39,
  delayCount40: edgeTable.delayCount40,
  delayCount41: edgeTable.delayCount41,
  delayCount42: edgeTable.delayCount42,
  delayCount43: edgeTable.delayCount43,
  delayCount44: edgeTable.delayCount44,
  delayCount45: edgeTable.delayCount45,
  delayCount46: edgeTable.delayCount46,
  delayCount47: edgeTable.delayCount47,
  delayCount48: edgeTable.delayCount48,
  delayCount49: edgeTable.delayCount49,
};

export const computeLatency = sql<number>`
  (
    sumLatencyCount00 * ${BUCKETS[0].avg} + 
    sumLatencyCount01 * ${BUCKETS[1].avg} +
    sumLatencyCount02 * ${BUCKETS[2].avg} +
    sumLatencyCount03 * ${BUCKETS[3].avg} +
    sumLatencyCount04 * ${BUCKETS[4].avg} +
    sumLatencyCount05 * ${BUCKETS[5].avg} +
    sumLatencyCount06 * ${BUCKETS[6].avg} +
    sumLatencyCount07 * ${BUCKETS[7].avg} +
    sumLatencyCount08 * ${BUCKETS[8].avg} +
    sumLatencyCount09 * ${BUCKETS[9].avg} +
    sumLatencyCount10 * ${BUCKETS[10].avg} +
    sumLatencyCount11 * ${BUCKETS[11].avg} +
    sumLatencyCount12 * ${BUCKETS[12].avg} +
    sumLatencyCount13 * ${BUCKETS[13].avg} +
    sumLatencyCount14 * ${BUCKETS[14].avg} +
    sumLatencyCount15 * ${BUCKETS[15].avg} +
    sumLatencyCount16 * ${BUCKETS[16].avg} +
    sumLatencyCount17 * ${BUCKETS[17].avg} +
    sumLatencyCount18 * ${BUCKETS[18].avg} +
    sumLatencyCount19 * ${BUCKETS[19].avg} +
    sumLatencyCount20 * ${BUCKETS[20].avg} +
    sumLatencyCount21 * ${BUCKETS[21].avg} +
    sumLatencyCount22 * ${BUCKETS[22].avg} +
    sumLatencyCount23 * ${BUCKETS[23].avg} +
    sumLatencyCount24 * ${BUCKETS[24].avg} +
    sumLatencyCount25 * ${BUCKETS[25].avg} +
    sumLatencyCount26 * ${BUCKETS[26].avg} +
    sumLatencyCount27 * ${BUCKETS[27].avg} +
    sumLatencyCount28 * ${BUCKETS[28].avg} +
    sumLatencyCount29 * ${BUCKETS[29].avg} +
    sumLatencyCount30 * ${BUCKETS[30].avg} +
    sumLatencyCount31 * ${BUCKETS[31].avg} +
    sumLatencyCount32 * ${BUCKETS[32].avg} +
    sumLatencyCount33 * ${BUCKETS[33].avg} +
    sumLatencyCount34 * ${BUCKETS[34].avg} +
    sumLatencyCount35 * ${BUCKETS[35].avg} +
    sumLatencyCount36 * ${BUCKETS[36].avg} +
    sumLatencyCount37 * ${BUCKETS[37].avg} +
    sumLatencyCount38 * ${BUCKETS[38].avg} +
    sumLatencyCount39 * ${BUCKETS[39].avg} +
    sumLatencyCount40 * ${BUCKETS[40].avg} +
    sumLatencyCount41 * ${BUCKETS[41].avg} +
    sumLatencyCount42 * ${BUCKETS[42].avg} +
    sumLatencyCount43 * ${BUCKETS[43].avg} +
    sumLatencyCount44 * ${BUCKETS[44].avg} +
    sumLatencyCount45 * ${BUCKETS[45].avg} +
    sumLatencyCount46 * ${BUCKETS[46].avg} +
    sumLatencyCount47 * ${BUCKETS[47].avg} +
    sumLatencyCount48 * ${BUCKETS[48].avg} +
    sumLatencyCount49 * ${BUCKETS[49].avg}
  ) / (
    sumLatencyCount00 +
    sumLatencyCount01 +
    sumLatencyCount02 +
    sumLatencyCount03 +
    sumLatencyCount04 +
    sumLatencyCount05 +
    sumLatencyCount06 +
    sumLatencyCount07 +
    sumLatencyCount08 +
    sumLatencyCount09 +
    sumLatencyCount10 +
    sumLatencyCount11 +
    sumLatencyCount12 +
    sumLatencyCount13 +
    sumLatencyCount14 +
    sumLatencyCount15 +
    sumLatencyCount16 +
    sumLatencyCount17 +
    sumLatencyCount18 +
    sumLatencyCount19 +
    sumLatencyCount20 +
    sumLatencyCount21 +
    sumLatencyCount22 +
    sumLatencyCount23 +
    sumLatencyCount24 +
    sumLatencyCount25 +
    sumLatencyCount26 +
    sumLatencyCount27 +
    sumLatencyCount28 +
    sumLatencyCount29 +
    sumLatencyCount30 +
    sumLatencyCount31 +
    sumLatencyCount32 +
    sumLatencyCount33 +
    sumLatencyCount34 +
    sumLatencyCount35 +
    sumLatencyCount36 +
    sumLatencyCount37 +
    sumLatencyCount38 +
    sumLatencyCount39 +
    sumLatencyCount40 +
    sumLatencyCount41 +
    sumLatencyCount42 +
    sumLatencyCount43 +
    sumLatencyCount44 +
    sumLatencyCount45 +
    sumLatencyCount46 +
    sumLatencyCount47 +
    sumLatencyCount48 +
    sumLatencyCount49
  )`;

export const latencyColumnSums = {
  sumLatencyCount00: sql<number>`sum(${edgeTable.latencyCount00}) as sumLatencyCount00`,
  sumLatencyCount01: sql<number>`sum(${edgeTable.latencyCount01}) as sumLatencyCount01`,
  sumLatencyCount02: sql<number>`sum(${edgeTable.latencyCount02}) as sumLatencyCount02`,
  sumLatencyCount03: sql<number>`sum(${edgeTable.latencyCount03}) as sumLatencyCount03`,
  sumLatencyCount04: sql<number>`sum(${edgeTable.latencyCount04}) as sumLatencyCount04`,
  sumLatencyCount05: sql<number>`sum(${edgeTable.latencyCount05}) as sumLatencyCount05`,
  sumLatencyCount06: sql<number>`sum(${edgeTable.latencyCount06}) as sumLatencyCount06`,
  sumLatencyCount07: sql<number>`sum(${edgeTable.latencyCount07}) as sumLatencyCount07`,
  sumLatencyCount08: sql<number>`sum(${edgeTable.latencyCount08}) as sumLatencyCount08`,
  sumLatencyCount09: sql<number>`sum(${edgeTable.latencyCount09}) as sumLatencyCount09`,
  sumLatencyCount10: sql<number>`sum(${edgeTable.latencyCount10}) as sumLatencyCount10`,
  sumLatencyCount11: sql<number>`sum(${edgeTable.latencyCount11}) as sumLatencyCount11`,
  sumLatencyCount12: sql<number>`sum(${edgeTable.latencyCount12}) as sumLatencyCount12`,
  sumLatencyCount13: sql<number>`sum(${edgeTable.latencyCount13}) as sumLatencyCount13`,
  sumLatencyCount14: sql<number>`sum(${edgeTable.latencyCount14}) as sumLatencyCount14`,
  sumLatencyCount15: sql<number>`sum(${edgeTable.latencyCount15}) as sumLatencyCount15`,
  sumLatencyCount16: sql<number>`sum(${edgeTable.latencyCount16}) as sumLatencyCount16`,
  sumLatencyCount17: sql<number>`sum(${edgeTable.latencyCount17}) as sumLatencyCount17`,
  sumLatencyCount18: sql<number>`sum(${edgeTable.latencyCount18}) as sumLatencyCount18`,
  sumLatencyCount19: sql<number>`sum(${edgeTable.latencyCount19}) as sumLatencyCount19`,
  sumLatencyCount20: sql<number>`sum(${edgeTable.latencyCount20}) as sumLatencyCount20`,
  sumLatencyCount21: sql<number>`sum(${edgeTable.latencyCount21}) as sumLatencyCount21`,
  sumLatencyCount22: sql<number>`sum(${edgeTable.latencyCount22}) as sumLatencyCount22`,
  sumLatencyCount23: sql<number>`sum(${edgeTable.latencyCount23}) as sumLatencyCount23`,
  sumLatencyCount24: sql<number>`sum(${edgeTable.latencyCount24}) as sumLatencyCount24`,
  sumLatencyCount25: sql<number>`sum(${edgeTable.latencyCount25}) as sumLatencyCount25`,
  sumLatencyCount26: sql<number>`sum(${edgeTable.latencyCount26}) as sumLatencyCount26`,
  sumLatencyCount27: sql<number>`sum(${edgeTable.latencyCount27}) as sumLatencyCount27`,
  sumLatencyCount28: sql<number>`sum(${edgeTable.latencyCount28}) as sumLatencyCount28`,
  sumLatencyCount29: sql<number>`sum(${edgeTable.latencyCount29}) as sumLatencyCount29`,
  sumLatencyCount30: sql<number>`sum(${edgeTable.latencyCount30}) as sumLatencyCount30`,
  sumLatencyCount31: sql<number>`sum(${edgeTable.latencyCount31}) as sumLatencyCount31`,
  sumLatencyCount32: sql<number>`sum(${edgeTable.latencyCount32}) as sumLatencyCount32`,
  sumLatencyCount33: sql<number>`sum(${edgeTable.latencyCount33}) as sumLatencyCount33`,
  sumLatencyCount34: sql<number>`sum(${edgeTable.latencyCount34}) as sumLatencyCount34`,
  sumLatencyCount35: sql<number>`sum(${edgeTable.latencyCount35}) as sumLatencyCount35`,
  sumLatencyCount36: sql<number>`sum(${edgeTable.latencyCount36}) as sumLatencyCount36`,
  sumLatencyCount37: sql<number>`sum(${edgeTable.latencyCount37}) as sumLatencyCount37`,
  sumLatencyCount38: sql<number>`sum(${edgeTable.latencyCount38}) as sumLatencyCount38`,
  sumLatencyCount39: sql<number>`sum(${edgeTable.latencyCount39}) as sumLatencyCount39`,
  sumLatencyCount40: sql<number>`sum(${edgeTable.latencyCount40}) as sumLatencyCount40`,
  sumLatencyCount41: sql<number>`sum(${edgeTable.latencyCount41}) as sumLatencyCount41`,
  sumLatencyCount42: sql<number>`sum(${edgeTable.latencyCount42}) as sumLatencyCount42`,
  sumLatencyCount43: sql<number>`sum(${edgeTable.latencyCount43}) as sumLatencyCount43`,
  sumLatencyCount44: sql<number>`sum(${edgeTable.latencyCount44}) as sumLatencyCount44`,
  sumLatencyCount45: sql<number>`sum(${edgeTable.latencyCount45}) as sumLatencyCount45`,
  sumLatencyCount46: sql<number>`sum(${edgeTable.latencyCount46}) as sumLatencyCount46`,
  sumLatencyCount47: sql<number>`sum(${edgeTable.latencyCount47}) as sumLatencyCount47`,
  sumLatencyCount48: sql<number>`sum(${edgeTable.latencyCount48}) as sumLatencyCount48`,
  sumLatencyCount49: sql<number>`sum(${edgeTable.latencyCount49}) as sumLatencyCount49`,
};

export const latencyColumnSumList = sql<string>`
  CAST(sum(${edgeTable.latencyCount00}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.latencyCount01}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.latencyCount02}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.latencyCount03}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.latencyCount04}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.latencyCount05}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.latencyCount06}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.latencyCount07}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.latencyCount08}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.latencyCount09}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.latencyCount10}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.latencyCount11}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.latencyCount12}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.latencyCount13}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.latencyCount14}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.latencyCount15}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.latencyCount16}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.latencyCount17}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.latencyCount18}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.latencyCount19}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.latencyCount20}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.latencyCount21}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.latencyCount22}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.latencyCount23}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.latencyCount24}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.latencyCount25}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.latencyCount26}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.latencyCount27}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.latencyCount28}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.latencyCount29}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.latencyCount30}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.latencyCount31}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.latencyCount32}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.latencyCount33}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.latencyCount34}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.latencyCount35}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.latencyCount36}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.latencyCount37}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.latencyCount38}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.latencyCount39}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.latencyCount40}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.latencyCount41}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.latencyCount42}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.latencyCount43}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.latencyCount44}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.latencyCount45}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.latencyCount46}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.latencyCount47}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.latencyCount48}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.latencyCount49}) as VARCHAR)`;

export const delayColumnSumList = sql<string>`
  CAST(sum(${edgeTable.delayCount00}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.delayCount01}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.delayCount02}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.delayCount03}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.delayCount04}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.delayCount05}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.delayCount06}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.delayCount07}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.delayCount08}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.delayCount09}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.delayCount10}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.delayCount11}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.delayCount12}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.delayCount13}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.delayCount14}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.delayCount15}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.delayCount16}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.delayCount17}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.delayCount18}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.delayCount19}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.delayCount20}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.delayCount21}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.delayCount22}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.delayCount23}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.delayCount24}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.delayCount25}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.delayCount26}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.delayCount27}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.delayCount28}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.delayCount29}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.delayCount30}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.delayCount31}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.delayCount32}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.delayCount33}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.delayCount34}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.delayCount35}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.delayCount36}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.delayCount37}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.delayCount38}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.delayCount39}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.delayCount40}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.delayCount41}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.delayCount42}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.delayCount43}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.delayCount44}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.delayCount45}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.delayCount46}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.delayCount47}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.delayCount48}) as VARCHAR) || ';' ||
  CAST(sum(${edgeTable.delayCount49}) as VARCHAR)`;

export const latencyCount = {
  latencyCount: sql<number>`
    ${edgeTable.latencyCount00} + 
    ${edgeTable.latencyCount01} + 
    ${edgeTable.latencyCount02} + 
    ${edgeTable.latencyCount03} + 
    ${edgeTable.latencyCount04} + 
    ${edgeTable.latencyCount05} + 
    ${edgeTable.latencyCount06} + 
    ${edgeTable.latencyCount07} + 
    ${edgeTable.latencyCount08} + 
    ${edgeTable.latencyCount09} + 
    ${edgeTable.latencyCount10} + 
    ${edgeTable.latencyCount11} + 
    ${edgeTable.latencyCount12} + 
    ${edgeTable.latencyCount13} + 
    ${edgeTable.latencyCount14} + 
    ${edgeTable.latencyCount15} + 
    ${edgeTable.latencyCount16} + 
    ${edgeTable.latencyCount17} + 
    ${edgeTable.latencyCount18} + 
    ${edgeTable.latencyCount19} + 
    ${edgeTable.latencyCount20} + 
    ${edgeTable.latencyCount21} + 
    ${edgeTable.latencyCount22} + 
    ${edgeTable.latencyCount23} + 
    ${edgeTable.latencyCount24} + 
    ${edgeTable.latencyCount25} + 
    ${edgeTable.latencyCount26} + 
    ${edgeTable.latencyCount27} + 
    ${edgeTable.latencyCount28} + 
    ${edgeTable.latencyCount29} + 
    ${edgeTable.latencyCount30} + 
    ${edgeTable.latencyCount31} + 
    ${edgeTable.latencyCount32} + 
    ${edgeTable.latencyCount33} + 
    ${edgeTable.latencyCount34} + 
    ${edgeTable.latencyCount35} + 
    ${edgeTable.latencyCount36} + 
    ${edgeTable.latencyCount37} + 
    ${edgeTable.latencyCount38} + 
    ${edgeTable.latencyCount39} + 
    ${edgeTable.latencyCount40} + 
    ${edgeTable.latencyCount41} + 
    ${edgeTable.latencyCount42} + 
    ${edgeTable.latencyCount43} + 
    ${edgeTable.latencyCount44} + 
    ${edgeTable.latencyCount45} + 
    ${edgeTable.latencyCount46} + 
    ${edgeTable.latencyCount47} + 
    ${edgeTable.latencyCount48} + 
    ${edgeTable.latencyCount49} as latencyCount`,
};

export const delayColumnSums = {
  sumDelayCount00: sql<number>`sum(${edgeTable.delayCount00}) as sumDelayCount00`,
  sumDelayCount01: sql<number>`sum(${edgeTable.delayCount01}) as sumDelayCount01`,
  sumDelayCount02: sql<number>`sum(${edgeTable.delayCount02}) as sumDelayCount02`,
  sumDelayCount03: sql<number>`sum(${edgeTable.delayCount03}) as sumDelayCount03`,
  sumDelayCount04: sql<number>`sum(${edgeTable.delayCount04}) as sumDelayCount04`,
  sumDelayCount05: sql<number>`sum(${edgeTable.delayCount05}) as sumDelayCount05`,
  sumDelayCount06: sql<number>`sum(${edgeTable.delayCount06}) as sumDelayCount06`,
  sumDelayCount07: sql<number>`sum(${edgeTable.delayCount07}) as sumDelayCount07`,
  sumDelayCount08: sql<number>`sum(${edgeTable.delayCount08}) as sumDelayCount08`,
  sumDelayCount09: sql<number>`sum(${edgeTable.delayCount09}) as sumDelayCount09`,
  sumDelayCount10: sql<number>`sum(${edgeTable.delayCount10}) as sumDelayCount10`,
  sumDelayCount11: sql<number>`sum(${edgeTable.delayCount11}) as sumDelayCount11`,
  sumDelayCount12: sql<number>`sum(${edgeTable.delayCount12}) as sumDelayCount12`,
  sumDelayCount13: sql<number>`sum(${edgeTable.delayCount13}) as sumDelayCount13`,
  sumDelayCount14: sql<number>`sum(${edgeTable.delayCount14}) as sumDelayCount14`,
  sumDelayCount15: sql<number>`sum(${edgeTable.delayCount15}) as sumDelayCount15`,
  sumDelayCount16: sql<number>`sum(${edgeTable.delayCount16}) as sumDelayCount16`,
  sumDelayCount17: sql<number>`sum(${edgeTable.delayCount17}) as sumDelayCount17`,
  sumDelayCount18: sql<number>`sum(${edgeTable.delayCount18}) as sumDelayCount18`,
  sumDelayCount19: sql<number>`sum(${edgeTable.delayCount19}) as sumDelayCount19`,
  sumDelayCount20: sql<number>`sum(${edgeTable.delayCount20}) as sumDelayCount20`,
  sumDelayCount21: sql<number>`sum(${edgeTable.delayCount21}) as sumDelayCount21`,
  sumDelayCount22: sql<number>`sum(${edgeTable.delayCount22}) as sumDelayCount22`,
  sumDelayCount23: sql<number>`sum(${edgeTable.delayCount23}) as sumDelayCount23`,
  sumDelayCount24: sql<number>`sum(${edgeTable.delayCount24}) as sumDelayCount24`,
  sumDelayCount25: sql<number>`sum(${edgeTable.delayCount25}) as sumDelayCount25`,
  sumDelayCount26: sql<number>`sum(${edgeTable.delayCount26}) as sumDelayCount26`,
  sumDelayCount27: sql<number>`sum(${edgeTable.delayCount27}) as sumDelayCount27`,
  sumDelayCount28: sql<number>`sum(${edgeTable.delayCount28}) as sumDelayCount28`,
  sumDelayCount29: sql<number>`sum(${edgeTable.delayCount29}) as sumDelayCount29`,
  sumDelayCount30: sql<number>`sum(${edgeTable.delayCount30}) as sumDelayCount30`,
  sumDelayCount31: sql<number>`sum(${edgeTable.delayCount31}) as sumDelayCount31`,
  sumDelayCount32: sql<number>`sum(${edgeTable.delayCount32}) as sumDelayCount32`,
  sumDelayCount33: sql<number>`sum(${edgeTable.delayCount33}) as sumDelayCount33`,
  sumDelayCount34: sql<number>`sum(${edgeTable.delayCount34}) as sumDelayCount34`,
  sumDelayCount35: sql<number>`sum(${edgeTable.delayCount35}) as sumDelayCount35`,
  sumDelayCount36: sql<number>`sum(${edgeTable.delayCount36}) as sumDelayCount36`,
  sumDelayCount37: sql<number>`sum(${edgeTable.delayCount37}) as sumDelayCount37`,
  sumDelayCount38: sql<number>`sum(${edgeTable.delayCount38}) as sumDelayCount38`,
  sumDelayCount39: sql<number>`sum(${edgeTable.delayCount39}) as sumDelayCount39`,
  sumDelayCount40: sql<number>`sum(${edgeTable.delayCount40}) as sumDelayCount40`,
  sumDelayCount41: sql<number>`sum(${edgeTable.delayCount41}) as sumDelayCount41`,
  sumDelayCount42: sql<number>`sum(${edgeTable.delayCount42}) as sumDelayCount42`,
  sumDelayCount43: sql<number>`sum(${edgeTable.delayCount43}) as sumDelayCount43`,
  sumDelayCount44: sql<number>`sum(${edgeTable.delayCount44}) as sumDelayCount44`,
  sumDelayCount45: sql<number>`sum(${edgeTable.delayCount45}) as sumDelayCount45`,
  sumDelayCount46: sql<number>`sum(${edgeTable.delayCount46}) as sumDelayCount46`,
  sumDelayCount47: sql<number>`sum(${edgeTable.delayCount47}) as sumDelayCount47`,
  sumDelayCount48: sql<number>`sum(${edgeTable.delayCount48}) as sumDelayCount48`,
  sumDelayCount49: sql<number>`sum(${edgeTable.delayCount49}) as sumDelayCount49`,
};

export const timelineDelayAsList = sql<string>`(
  CAST(SUM(${routesTable.timeline00}) as VARCHAR) || ';' ||
  CAST(SUM(${routesTable.timeline01}) as VARCHAR) || ';' ||
  CAST(SUM(${routesTable.timeline02}) as VARCHAR) || ';' ||
  CAST(SUM(${routesTable.timeline03}) as VARCHAR) || ';' ||
  CAST(SUM(${routesTable.timeline04}) as VARCHAR) || ';' ||
  CAST(SUM(${routesTable.timeline05}) as VARCHAR) || ';' ||
  CAST(SUM(${routesTable.timeline06}) as VARCHAR) || ';' ||
  CAST(SUM(${routesTable.timeline07}) as VARCHAR) || ';' ||
  CAST(SUM(${routesTable.timeline08}) as VARCHAR) || ';' ||
  CAST(SUM(${routesTable.timeline09}) as VARCHAR) || ';' ||
  CAST(SUM(${routesTable.timeline10}) as VARCHAR) || ';' ||
  CAST(SUM(${routesTable.timeline11}) as VARCHAR) || ';' ||
  CAST(SUM(${routesTable.timeline12}) as VARCHAR) || ';' ||
  CAST(SUM(${routesTable.timeline13}) as VARCHAR) || ';' ||
  CAST(SUM(${routesTable.timeline14}) as VARCHAR) || ';' ||
  CAST(SUM(${routesTable.timeline15}) as VARCHAR) || ';' ||
  CAST(SUM(${routesTable.timeline16}) as VARCHAR) || ';' ||
  CAST(SUM(${routesTable.timeline17}) as VARCHAR) || ';' ||
  CAST(SUM(${routesTable.timeline18}) as VARCHAR) || ';' ||
  CAST(SUM(${routesTable.timeline19}) as VARCHAR) || ';' ||
  CAST(SUM(${routesTable.timeline20}) as VARCHAR) || ';' ||
  CAST(SUM(${routesTable.timeline21}) as VARCHAR) || ';' ||
  CAST(SUM(${routesTable.timeline22}) as VARCHAR) || ';' ||
  CAST(SUM(${routesTable.timeline23}) as VARCHAR) || ';' ||
  CAST(SUM(${routesTable.timeline24}) as VARCHAR) || ';' ||
  CAST(SUM(${routesTable.timeline25}) as VARCHAR) || ';' ||
  CAST(SUM(${routesTable.timeline26}) as VARCHAR) || ';' ||
  CAST(SUM(${routesTable.timeline27}) as VARCHAR) || ';' ||
  CAST(SUM(${routesTable.timeline28}) as VARCHAR) || ';' ||
  CAST(SUM(${routesTable.timeline29}) as VARCHAR) || ';' ||
  CAST(SUM(${routesTable.timeline30}) as VARCHAR) || ';' ||
  CAST(SUM(${routesTable.timeline31}) as VARCHAR) || ';' ||
  CAST(SUM(${routesTable.timeline32}) as VARCHAR) || ';' ||
  CAST(SUM(${routesTable.timeline33}) as VARCHAR) || ';' ||
  CAST(SUM(${routesTable.timeline34}) as VARCHAR) || ';' ||
  CAST(SUM(${routesTable.timeline35}) as VARCHAR) || ';' ||
  CAST(SUM(${routesTable.timeline36}) as VARCHAR) || ';' ||
  CAST(SUM(${routesTable.timeline37}) as VARCHAR) || ';' ||
  CAST(SUM(${routesTable.timeline38}) as VARCHAR) || ';' ||
  CAST(SUM(${routesTable.timeline39}) as VARCHAR) || ';' ||
  CAST(SUM(${routesTable.timeline40}) as VARCHAR) || ';' ||
  CAST(SUM(${routesTable.timeline41}) as VARCHAR) || ';' ||
  CAST(SUM(${routesTable.timeline42}) as VARCHAR) || ';' ||
  CAST(SUM(${routesTable.timeline43}) as VARCHAR) || ';' ||
  CAST(SUM(${routesTable.timeline44}) as VARCHAR) || ';' ||
  CAST(SUM(${routesTable.timeline45}) as VARCHAR) || ';' ||
  CAST(SUM(${routesTable.timeline46}) as VARCHAR) || ';' ||
  CAST(SUM(${routesTable.timeline47}) as VARCHAR) || ';' ||
  CAST(SUM(${routesTable.timeline48}) as VARCHAR) || ';' ||
  CAST(SUM(${routesTable.timeline49}) as VARCHAR)
)`;

export const timelineDelays = {
  timeline00: routesTable.timeline00,
  timeline01: routesTable.timeline01,
  timeline02: routesTable.timeline02,
  timeline03: routesTable.timeline03,
  timeline04: routesTable.timeline04,
  timeline05: routesTable.timeline05,
  timeline06: routesTable.timeline06,
  timeline07: routesTable.timeline07,
  timeline08: routesTable.timeline08,
  timeline09: routesTable.timeline09,
  timeline10: routesTable.timeline10,
  timeline11: routesTable.timeline11,
  timeline12: routesTable.timeline12,
  timeline13: routesTable.timeline13,
  timeline14: routesTable.timeline14,
  timeline15: routesTable.timeline15,
  timeline16: routesTable.timeline16,
  timeline17: routesTable.timeline17,
  timeline18: routesTable.timeline18,
  timeline19: routesTable.timeline19,
  timeline20: routesTable.timeline20,
  timeline21: routesTable.timeline21,
  timeline22: routesTable.timeline22,
  timeline23: routesTable.timeline23,
  timeline24: routesTable.timeline24,
  timeline25: routesTable.timeline25,
  timeline26: routesTable.timeline26,
  timeline27: routesTable.timeline27,
  timeline28: routesTable.timeline28,
  timeline29: routesTable.timeline29,
  timeline30: routesTable.timeline30,
  timeline31: routesTable.timeline31,
  timeline32: routesTable.timeline32,
  timeline33: routesTable.timeline33,
  timeline34: routesTable.timeline34,
  timeline35: routesTable.timeline35,
  timeline36: routesTable.timeline36,
  timeline37: routesTable.timeline37,
  timeline38: routesTable.timeline38,
  timeline39: routesTable.timeline39,
  timeline40: routesTable.timeline40,
  timeline41: routesTable.timeline41,
  timeline42: routesTable.timeline42,
  timeline43: routesTable.timeline43,
  timeline44: routesTable.timeline44,
  timeline45: routesTable.timeline45,
  timeline46: routesTable.timeline46,
  timeline47: routesTable.timeline47,
  timeline48: routesTable.timeline48,
  timeline49: routesTable.timeline49,
};

export const timelineAvg = sql<number>`
  (
    ${routesTable.timeline00} * ${BUCKETS[0].avg} + 
    ${routesTable.timeline01} * ${BUCKETS[1].avg} +
    ${routesTable.timeline02} * ${BUCKETS[2].avg} +
    ${routesTable.timeline03} * ${BUCKETS[3].avg} +
    ${routesTable.timeline04} * ${BUCKETS[4].avg} +
    ${routesTable.timeline05} * ${BUCKETS[5].avg} +
    ${routesTable.timeline06} * ${BUCKETS[6].avg} +
    ${routesTable.timeline07} * ${BUCKETS[7].avg} +
    ${routesTable.timeline08} * ${BUCKETS[8].avg} +
    ${routesTable.timeline09} * ${BUCKETS[9].avg} +
    ${routesTable.timeline10} * ${BUCKETS[10].avg} +
    ${routesTable.timeline11} * ${BUCKETS[11].avg} +
    ${routesTable.timeline12} * ${BUCKETS[12].avg} +
    ${routesTable.timeline13} * ${BUCKETS[13].avg} +
    ${routesTable.timeline14} * ${BUCKETS[14].avg} +
    ${routesTable.timeline15} * ${BUCKETS[15].avg} +
    ${routesTable.timeline16} * ${BUCKETS[16].avg} +
    ${routesTable.timeline17} * ${BUCKETS[17].avg} +
    ${routesTable.timeline18} * ${BUCKETS[18].avg} +
    ${routesTable.timeline19} * ${BUCKETS[19].avg} +
    ${routesTable.timeline20} * ${BUCKETS[20].avg} +
    ${routesTable.timeline21} * ${BUCKETS[21].avg} +
    ${routesTable.timeline22} * ${BUCKETS[22].avg} +
    ${routesTable.timeline23} * ${BUCKETS[23].avg} +
    ${routesTable.timeline24} * ${BUCKETS[24].avg} +
    ${routesTable.timeline25} * ${BUCKETS[25].avg} +
    ${routesTable.timeline26} * ${BUCKETS[26].avg} +
    ${routesTable.timeline27} * ${BUCKETS[27].avg} +
    ${routesTable.timeline28} * ${BUCKETS[28].avg} +
    ${routesTable.timeline29} * ${BUCKETS[29].avg} +
    ${routesTable.timeline30} * ${BUCKETS[30].avg} +
    ${routesTable.timeline31} * ${BUCKETS[31].avg} +
    ${routesTable.timeline32} * ${BUCKETS[32].avg} +
    ${routesTable.timeline33} * ${BUCKETS[33].avg} +
    ${routesTable.timeline34} * ${BUCKETS[34].avg} +
    ${routesTable.timeline35} * ${BUCKETS[35].avg} +
    ${routesTable.timeline36} * ${BUCKETS[36].avg} +
    ${routesTable.timeline37} * ${BUCKETS[37].avg} +
    ${routesTable.timeline38} * ${BUCKETS[38].avg} +
    ${routesTable.timeline39} * ${BUCKETS[39].avg} +
    ${routesTable.timeline40} * ${BUCKETS[40].avg} +
    ${routesTable.timeline41} * ${BUCKETS[41].avg} +
    ${routesTable.timeline42} * ${BUCKETS[42].avg} +
    ${routesTable.timeline43} * ${BUCKETS[43].avg} +
    ${routesTable.timeline44} * ${BUCKETS[44].avg} +
    ${routesTable.timeline45} * ${BUCKETS[45].avg} +
    ${routesTable.timeline46} * ${BUCKETS[46].avg} +
    ${routesTable.timeline47} * ${BUCKETS[47].avg} +
    ${routesTable.timeline48} * ${BUCKETS[48].avg} +
    ${routesTable.timeline49} * ${BUCKETS[49].avg}
  ) / (
    ${routesTable.timeline00} +
    ${routesTable.timeline01} +
    ${routesTable.timeline02} +
    ${routesTable.timeline03} +
    ${routesTable.timeline04} +
    ${routesTable.timeline05} +
    ${routesTable.timeline06} +
    ${routesTable.timeline07} +
    ${routesTable.timeline08} +
    ${routesTable.timeline09} +
    ${routesTable.timeline10} +
    ${routesTable.timeline11} +
    ${routesTable.timeline12} +
    ${routesTable.timeline13} +
    ${routesTable.timeline14} +
    ${routesTable.timeline15} +
    ${routesTable.timeline16} +
    ${routesTable.timeline17} +
    ${routesTable.timeline18} +
    ${routesTable.timeline19} +
    ${routesTable.timeline20} +
    ${routesTable.timeline21} +
    ${routesTable.timeline22} +
    ${routesTable.timeline23} +
    ${routesTable.timeline24} +
    ${routesTable.timeline25} +
    ${routesTable.timeline26} +
    ${routesTable.timeline27} +
    ${routesTable.timeline28} +
    ${routesTable.timeline29} +
    ${routesTable.timeline30} +
    ${routesTable.timeline31} +
    ${routesTable.timeline32} +
    ${routesTable.timeline33} +
    ${routesTable.timeline34} +
    ${routesTable.timeline35} +
    ${routesTable.timeline36} +
    ${routesTable.timeline37} +
    ${routesTable.timeline38} +
    ${routesTable.timeline39} +
    ${routesTable.timeline40} +
    ${routesTable.timeline41} +
    ${routesTable.timeline42} +
    ${routesTable.timeline43} +
    ${routesTable.timeline44} +
    ${routesTable.timeline45} +
    ${routesTable.timeline46} +
    ${routesTable.timeline47} +
    ${routesTable.timeline48} +
    ${routesTable.timeline49}
  )`;

export const sumTimelineCount = sql<number>`
    SUM(${routesTable.timeline00}) +
    SUM(${routesTable.timeline01}) +
    SUM(${routesTable.timeline02}) +
    SUM(${routesTable.timeline03}) +
    SUM(${routesTable.timeline04}) +
    SUM(${routesTable.timeline05}) +
    SUM(${routesTable.timeline06}) +
    SUM(${routesTable.timeline07}) +
    SUM(${routesTable.timeline08}) +
    SUM(${routesTable.timeline09}) +
    SUM(${routesTable.timeline10}) +
    SUM(${routesTable.timeline11}) +
    SUM(${routesTable.timeline12}) +
    SUM(${routesTable.timeline13}) +
    SUM(${routesTable.timeline14}) +
    SUM(${routesTable.timeline15}) +
    SUM(${routesTable.timeline16}) +
    SUM(${routesTable.timeline17}) +
    SUM(${routesTable.timeline18}) +
    SUM(${routesTable.timeline19}) +
    SUM(${routesTable.timeline20}) +
    SUM(${routesTable.timeline21}) +
    SUM(${routesTable.timeline22}) +
    SUM(${routesTable.timeline23}) +
    SUM(${routesTable.timeline24}) +
    SUM(${routesTable.timeline25}) +
    SUM(${routesTable.timeline26}) +
    SUM(${routesTable.timeline27}) +
    SUM(${routesTable.timeline28}) +
    SUM(${routesTable.timeline29}) +
    SUM(${routesTable.timeline30}) +
    SUM(${routesTable.timeline31}) +
    SUM(${routesTable.timeline32}) +
    SUM(${routesTable.timeline33}) +
    SUM(${routesTable.timeline34}) +
    SUM(${routesTable.timeline35}) +
    SUM(${routesTable.timeline36}) +
    SUM(${routesTable.timeline37}) +
    SUM(${routesTable.timeline38}) +
    SUM(${routesTable.timeline39}) +
    SUM(${routesTable.timeline40}) +
    SUM(${routesTable.timeline41}) +
    SUM(${routesTable.timeline42}) +
    SUM(${routesTable.timeline43}) +
    SUM(${routesTable.timeline44}) +
    SUM(${routesTable.timeline45}) +
    SUM(${routesTable.timeline46}) +
    SUM(${routesTable.timeline47}) +
    SUM(${routesTable.timeline48}) +
    SUM(${routesTable.timeline49})`;

export function listToVector(list: string): number[] {
  return list.split(';').map((s) => parseInt(s, 10));
}

export function toVector<PREFIX extends string>(prefix: PREFIX, dat: VectorFields<PREFIX>) {
  const obj = dat as Record<string, number>;
  return [
    obj[prefix + '00'],
    obj[prefix + '01'],
    obj[prefix + '02'],
    obj[prefix + '03'],
    obj[prefix + '04'],
    obj[prefix + '05'],
    obj[prefix + '06'],
    obj[prefix + '07'],
    obj[prefix + '08'],
    obj[prefix + '09'],
    obj[prefix + '10'],
    obj[prefix + '11'],
    obj[prefix + '12'],
    obj[prefix + '13'],
    obj[prefix + '14'],
    obj[prefix + '15'],
    obj[prefix + '16'],
    obj[prefix + '17'],
    obj[prefix + '18'],
    obj[prefix + '19'],
    obj[prefix + '20'],
    obj[prefix + '21'],
    obj[prefix + '22'],
    obj[prefix + '23'],
    obj[prefix + '24'],
    obj[prefix + '25'],
    obj[prefix + '26'],
    obj[prefix + '27'],
    obj[prefix + '28'],
    obj[prefix + '29'],
    obj[prefix + '30'],
    obj[prefix + '31'],
    obj[prefix + '32'],
    obj[prefix + '33'],
    obj[prefix + '34'],
    obj[prefix + '35'],
    obj[prefix + '36'],
    obj[prefix + '37'],
    obj[prefix + '38'],
    obj[prefix + '39'],
    obj[prefix + '40'],
    obj[prefix + '41'],
    obj[prefix + '42'],
    obj[prefix + '43'],
    obj[prefix + '44'],
    obj[prefix + '45'],
    obj[prefix + '46'],
    obj[prefix + '47'],
    obj[prefix + '48'],
    obj[prefix + '49'],
  ];
}

export function timelineBucketField(bucket: number): VectorKeys<`timeline`> {
  return ('timeline' + pad(bucket)) as any;
}

export function createRouteRow({
  publicApiKey,
  manifestHash,
  route,
  symbol,
}: {
  publicApiKey: string;
  manifestHash: string;
  route: string;
  symbol: string;
}): RouteRowSansId {
  return {
    publicApiKey,
    manifestHash,
    route,
    symbol,
    timeline00: 0,
    timeline01: 0,
    timeline02: 0,
    timeline03: 0,
    timeline04: 0,
    timeline05: 0,
    timeline06: 0,
    timeline07: 0,
    timeline08: 0,
    timeline09: 0,
    timeline10: 0,
    timeline11: 0,
    timeline12: 0,
    timeline13: 0,
    timeline14: 0,
    timeline15: 0,
    timeline16: 0,
    timeline17: 0,
    timeline18: 0,
    timeline19: 0,
    timeline20: 0,
    timeline21: 0,
    timeline22: 0,
    timeline23: 0,
    timeline24: 0,
    timeline25: 0,
    timeline26: 0,
    timeline27: 0,
    timeline28: 0,
    timeline29: 0,
    timeline30: 0,
    timeline31: 0,
    timeline32: 0,
    timeline33: 0,
    timeline34: 0,
    timeline35: 0,
    timeline36: 0,
    timeline37: 0,
    timeline38: 0,
    timeline39: 0,
    timeline40: 0,
    timeline41: 0,
    timeline42: 0,
    timeline43: 0,
    timeline44: 0,
    timeline45: 0,
    timeline46: 0,
    timeline47: 0,
    timeline48: 0,
    timeline49: 0,
  };
}
