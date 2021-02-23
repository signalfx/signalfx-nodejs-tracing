'use strict'

const tx = require('./tx')

function injectedTags (tracer, span) {
  const tags = {}

  for (const key of tracer.logInjectionTags()) {
    tags[key] = span.context()._tags[key]
  }

  return tags
}

const log = {
  // Add trace identifiers from the current scope to a log record.
  correlate (tracer, record) {
    const span = tracer.scope().active()

    if (!span) return record

    const context = span.context()

    return Object.assign({}, record, {
      signalfx: Object.assign(injectedTags(tracer, span), {
        trace_id: context.toTraceIdHex(),
        span_id: context.toSpanIdHex(),
        service: context._tags['service.name']
      })
    })
  }
}

module.exports = Object.assign({}, tx, log)
