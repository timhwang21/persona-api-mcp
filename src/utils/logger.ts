/**
 * Logging utilities for Persona API MCP Server
 * 
 * This module provides structured logging capabilities with different
 * output formats and log levels for development and production use.
 */

import { getConfig } from './config.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  [key: string]: unknown;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context: LogContext | undefined;
  error: Error | undefined;
}

/**
 * Logger class with configurable output formats
 */
class Logger {
  private config = getConfig();

  /**
   * Check if a log level should be output based on current configuration
   */
  private shouldLog(level: LogLevel): boolean {
    const levels: Record<LogLevel, number> = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3,
    };

    return levels[level] >= levels[this.config.logging.level];
  }

  /**
   * Format log entry based on configuration
   */
  private formatLog(entry: LogEntry): string {
    if (this.config.logging.format === 'json') {
      return JSON.stringify({
        timestamp: entry.timestamp,
        level: entry.level,
        message: entry.message,
        ...entry.context,
        ...(entry.error && {
          error: {
            name: entry.error.name,
            message: entry.error.message,
            stack: entry.error.stack,
          },
        }),
      });
    } else {
      // Text format
      let logLine = `[${entry.timestamp}] ${entry.level.toUpperCase()}: ${entry.message}`;
      
      if (entry.context && Object.keys(entry.context).length > 0) {
        logLine += ` ${JSON.stringify(entry.context)}`;
      }
      
      if (entry.error) {
        logLine += `\nError: ${entry.error.message}`;
        if (entry.error.stack) {
          logLine += `\nStack: ${entry.error.stack}`;
        }
      }
      
      return logLine;
    }
  }

  /**
   * Write log entry to appropriate output
   */
  private writeLog(entry: LogEntry): void {
    if (!this.shouldLog(entry.level)) {
      return;
    }

    const formattedLog = this.formatLog(entry);

    // IMPORTANT: For MCP stdio transport, ALL logs must go to stderr
    // to avoid interfering with JSON-RPC protocol communication on stdout
    console.error(formattedLog);
  }

  /**
   * Create a log entry
   */
  private createLogEntry(
    level: LogLevel,
    message: string,
    context?: LogContext,
    error?: Error
  ): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      error,
    };
  }

  /**
   * Log debug message
   */
  debug(message: string, context?: LogContext): void {
    this.writeLog(this.createLogEntry('debug', message, context));
  }

  /**
   * Log info message
   */
  info(message: string, context?: LogContext): void {
    this.writeLog(this.createLogEntry('info', message, context));
  }

  /**
   * Log warning message
   */
  warn(message: string, context?: LogContext): void {
    this.writeLog(this.createLogEntry('warn', message, context));
  }

  /**
   * Log error message
   */
  error(message: string, error?: Error, context?: LogContext): void {
    this.writeLog(this.createLogEntry('error', message, context, error));
  }

  /**
   * Log API request
   */
  logRequest(method: string, url: string, context?: LogContext): void {
    if (!this.config.logging.enableRequestLogging) {
      return;
    }

    this.info('API Request', {
      method,
      url,
      ...context,
    });
  }

  /**
   * Log API response
   */
  logResponse(
    method: string,
    url: string,
    status: number,
    duration: number,
    context?: LogContext
  ): void {
    if (!this.config.logging.enableRequestLogging) {
      return;
    }

    const level = status >= 400 ? 'warn' : 'info';
    
    this.writeLog(this.createLogEntry(level, 'API Response', {
      method,
      url,
      status,
      duration,
      ...context,
    }));
  }

  /**
   * Log MCP tool execution
   */
  logToolExecution(toolName: string, duration: number, success: boolean, context?: LogContext): void {
    this.info('MCP Tool Execution', {
      tool: toolName,
      duration,
      success,
      ...context,
    });
  }

  /**
   * Log resource access
   */
  logResourceAccess(resourceUri: string, found: boolean, context?: LogContext): void {
    this.debug('Resource Access', {
      resource: resourceUri,
      found,
      ...context,
    });
  }
}

/**
 * Global logger instance
 */
export const logger = new Logger();

/**
 * Performance measurement utility
 */
export class PerformanceTimer {
  private startTime: number;
  private label: string;

  constructor(label: string) {
    this.label = label;
    this.startTime = Date.now();
  }

  /**
   * End the timer and log the duration
   */
  end(context?: LogContext): number {
    const duration = Date.now() - this.startTime;
    logger.debug(`Performance: ${this.label}`, {
      duration,
      ...context,
    });
    return duration;
  }

  /**
   * Get elapsed time without ending the timer
   */
  elapsed(): number {
    return Date.now() - this.startTime;
  }
}

/**
 * Create a performance timer
 */
export function createTimer(label: string): PerformanceTimer {
  return new PerformanceTimer(label);
}