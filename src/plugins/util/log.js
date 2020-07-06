'use strict'

const tx = require('./tx')

const log = {
  // Add trace identifiers from the current scope to a log record.
  correlate (tracer, record) {
    const span = tracer.scope().active()

    if (!span) return record

    return Object.assign({}, record, {
      signalfx: {
        trace_id: span.context().toTraceIdHex(),
        span_id: span.context().toSpanIdHex()
      }
    })
  }
}

module.exports = Object.assign({}, tx, log)
