/** @file Shared types */

export type Stringifiable = string | boolean | number | null;

export function isStringifiable(value: any): value is Stringifiable {
  return (
    value === /* ------ */ 'null' ||
    typeof value === /* ------ */ 'string' ||
    typeof value === /* ------ */ 'number' ||
    typeof value === /* ------ */ 'boolean'
  );
}

export const QRL_RUNTIME_CHUNK = 'qwik-runtime-mock-chunk';

export const enum SerializationConstant {
  REFERENCE_CHAR = /* ----------------- */ '\u0000',
  REFERENCE_VALUE = /* -------------------- */ 0x0,
  UNDEFINED_CHAR = /* ----------------- */ '\u0001',
  UNDEFINED_VALUE = /* -------------------- */ 0x1,
  QRL_CHAR = /* ----------------------- */ '\u0002',
  QRL_VALUE = /* -------------------------- */ 0x2,
  Task_CHAR = /* ---------------------- */ '\u0003',
  Task_VALUE = /* ------------------------- */ 0x3,
  Resource_CHAR = /* ------------------ */ '\u0004',
  Resource_VALUE = /* --------------------- */ 0x4,
  URL_CHAR = /* ----------------------- */ '\u0005',
  URL_VALUE = /* -------------------------- */ 0x5,
  Date_CHAR = /* ---------------------- */ '\u0006',
  Date_VALUE = /* ------------------------- */ 0x6,
  Regex_CHAR = /* --------------------- */ '\u0007',
  Regex_VALUE = /* ------------------------ */ 0x7,
  UNUSED_BACKSPACE_CHAR = /* ---------- */ '\u0008',
  UNUSED_BACKSPACE_VALUE = /* ------------- */ 0x8,
  UNUSED_HORIZONTAL_TAB_CHAR = /* ----- */ '\u0009',
  UNUSED_HORIZONTAL_TAB_VALUE = /* -------- */ 0x9,
  UNUSED_NEW_LINE_CHAR = /* ----------- */ '\u000a',
  UNUSED_NEW_LINE_VALUE = /* -------------- */ 0xa,
  UNUSED_VERTICAL_TAB_CHAR = /* ------- */ '\u000b',
  UNUSED_VERTICAL_TAB_VALUE = /* ---------- */ 0xb,
  UNUSED_FORM_FEED_CHAR = /* ---------- */ '\u000c',
  UNUSED_FORM_FEED_VALUE = /* ------------- */ 0xc,
  UNUSED_CARRIAGE_RETURN_CHAR = /* ---- */ '\u000d',
  UNUSED_CARRIAGE_RETURN_VALUE = /* ------- */ 0xd,
  Error_CHAR = /* --------------------- */ '\u000e',
  Error_VALUE = /* ------------------------ */ 0xe,
  Document_CHAR = /* ------------------ */ '\u000f',
  Document_VALUE = /* --------------------- */ 0xf,
  Component_CHAR = /* ----------------- */ '\u0010',
  Component_VALUE = /* ------------------- */ 0x10,
  DerivedSignal_CHAR = /* ------------- */ '\u0011',
  DerivedSignal_VALUE = /* --------------- */ 0x11,
  Signal_CHAR = /* -------------------- */ '\u0012',
  Signal_VALUE = /* ---------------------- */ 0x12,
  SignalWrapper_CHAR = /* ------------- */ '\u0013',
  SignalWrapper_VALUE = /* --------------- */ 0x13,
  NaN_CHAR = /* ----------------------- */ '\u0014',
  NaN_VALUE = /* ------------------------- */ 0x14,
  URLSearchParams_CHAR = /* ----------- */ '\u0015',
  URLSearchParams_VALUE = /* ------------- */ 0x15,
  FormData_CHAR = /* ------------------ */ '\u0016',
  FormData_VALUE = /* -------------------- */ 0x16,
  JSXNode_CHAR = /* ------------------- */ '\u0017',
  JSXNode_VALUE = /* --------------------- */ 0x17,
  BigInt_CHAR = /* -------------------- */ '\u0018',
  BigInt_VALUE = /* ---------------------- */ 0x18,
  Set_CHAR = /* ----------------------- */ '\u0019',
  Set_VALUE = /* ------------------------- */ 0x19,
  Map_CHAR = /* ----------------------- */ '\u001a',
  Map_VALUE = /* ------------------------- */ 0x1a,
  String_CHAR = /* -------------------- */ '\u001b',
  String_VALUE = /* ---------------------- */ 0x1b,
  LAST_VALUE = /* ------------------------ */ 0x1c,
}