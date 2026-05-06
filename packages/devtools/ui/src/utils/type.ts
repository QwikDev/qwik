export const isListen = (str: string) => {
  return /^on.*\$/.test(str);
};

export const isValue = (value: object): value is { untrackedValue: unknown; value: unknown } => {
  try {
    return 'untrackedValue' in value && 'value' in value;
  } catch {
    return false;
  }
};
