const regex = /((gt|sm)-|galaxy nexus)|samsung[- ]/i;

export function isSamsung(userAgent: string) {
  return Boolean(userAgent && userAgent.match(regex));
}
