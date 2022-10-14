import build from "pino-abstract-transport"

export default async (opts) => {
  const levels = {
    default: 'CUSTOM',
    60: 'FATAL',
    50: 'ERROR',
    40: 'WARN',
    30: 'INFO',
    20: 'DEBUG',
    10: 'TRACE'
  }

  const loggerProps = [
    'pid',
    'hostname',
    'name',
    'level',
    'time',
    'timestamp',
    'caller',
    'msg'
  ]

  return build(async (source) => {
    for await (let obj of source) {
      const params = Object.keys(obj)
        .filter(prop => loggerProps.indexOf(prop) === -1)
        .reduce((memo, prop) => {
          memo[prop] = obj[prop]
          return memo
        }, {})
      const line = `${(new Date()).toISOString()} [${levels[obj.level] || levels.default}] ${obj.msg}`

      if (obj.err) console.log(line, obj.err)
      else if (Object.keys(params).length > 0) console.log(line, params)
      else console.log(line)
    }
  })
}