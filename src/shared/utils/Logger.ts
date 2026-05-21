type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const privateDataWarning = '[Rapid Robot Job Assistant]';

export class Logger {
  constructor(private readonly scope: string) {}

  debug(message: string, details?: unknown): void {
    this.write('debug', message, details);
  }

  info(message: string, details?: unknown): void {
    this.write('info', message, details);
  }

  warn(message: string, details?: unknown): void {
    this.write('warn', message, details);
  }

  error(message: string, details?: unknown): void {
    this.write('error', message, details);
  }

  private write(level: LogLevel, message: string, details?: unknown): void {
    const safeDetails = typeof details === 'string' ? '[redacted string detail]' : details;
    console[level](`${privateDataWarning} ${this.scope}: ${message}`, safeDetails ?? '');
  }
}
