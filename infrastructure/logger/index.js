import pino from 'pino'
import { utility } from '../utility/index.js'

export const logger = pino({
  redact: {
    paths: ['hostname'],
    censor: '**REDACTED**'
  },
  level: process.env['LOG_LEVEL'], // silent, trace, debug, info, warn, error, fatal
  transport: process.env['NODE_ENV'] === 'development'
    ? {target: 'pino-pretty'}
    : {target: utility.resolvePath(import.meta.url, 'worker.js')}
})
