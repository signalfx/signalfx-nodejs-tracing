'use strict'

const _truncate = require('lodash.truncate')

function truncate (value, length) {
  if (typeof length !== 'number' || !(length >= 0)) {
    return value
  }

  const type = typeof value

  if (type === 'object' && value === null) {
    return value
  }

  if (type === 'object' || Array.isArray(value)) {
    return _truncate(JSON.stringify(value), { length })
  }

  if (type === 'string') {
    return _truncate(value, { length })
  }

  if (type === 'bigint' || type === 'symbol' || type === 'function') {
    return _truncate(value.toString(), { length })
  }

  return value
}

module.exports = truncate
