import fs from 'fs/promises';
import path from 'path';

const LOG_DIR = path.resolve(process.cwd(), 'logs');
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const RUN_STARTED_AT = new Date();
const FILES_BY_AGENT = new Map<string, string>();

const pad2 = (value: number) => String(value).padStart(2, '0');

const formatFileName = (agent: string, when: Date) => {
  const hours = pad2(when.getHours());
  const minutes = pad2(when.getMinutes());
  const weekday = WEEKDAYS[when.getDay()] ?? 'Unknown';
  const month = MONTHS[when.getMonth()] ?? 'Unknown';
  const day = pad2(when.getDate());
  const year = when.getFullYear();
  return `${agent}.${hours}.${minutes}-${weekday}.${month}.${day}.${year}.log`;
};

const resolveLogFile = (agent: string) => {
  let filePath = FILES_BY_AGENT.get(agent);
  if (!filePath) {
    const filename = formatFileName(agent, RUN_STARTED_AT);
    filePath = path.join(LOG_DIR, filename);
    FILES_BY_AGENT.set(agent, filePath);
  }
  return filePath;
};

export const log = async (agent: string, ...args: any[]) => {
  if (!agent || typeof agent !== 'string') {
    return;
  }
  try {
    const now = new Date();
    const hours = pad2(now.getHours());
    const minutes = pad2(now.getMinutes());
    const seconds = pad2(now.getSeconds());
    const entryBody = args.map((arg) => {
      if (typeof arg === 'string') {
        return arg.replace(/\\n/g, '\n').replace(/\\"/g, '"');
      }
      try {
        return JSON.stringify(arg, null, 2).replace(/\\n/g, '\n').replace(/\\"/g, '"');
      } catch {
        return String(arg);
      }
    }).join(' ');
    const entry = `[${hours}:${minutes}:${seconds}] ${entryBody}\n`;
    const filePath = resolveLogFile(agent);
    await fs.mkdir(LOG_DIR, { recursive: true });
    await fs.appendFile(filePath, entry, 'utf-8');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.debug('Failed to write log entry:', message);
  }
};
