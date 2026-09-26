// Prefixes every log line with the time and this service's name, e.g. "1:22am gateway: ..."
const SERVICE = 'gateway';

const timestamp = () => {
  const now = new Date();
  const hours = now.getHours() % 12 || 12;
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}${now.getHours() < 12 ? 'am' : 'pm'}`;
};

export const log = (...args) => console.log(`${timestamp()} ${SERVICE}:`, ...args);
export const logError = (...args) => console.error(`${timestamp()} ${SERVICE}:`, ...args);
