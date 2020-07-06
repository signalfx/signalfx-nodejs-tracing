'use strict'

const platform = require('../../platform')
const SignalFxSpanContext = require('../span_context')

class LogPropagator {
  inject (spanContext, carrier) {
    if (!carrier) return

    carrier.signalfx = {
      trace_id: spanContext.toTraceIdHex(),
      span_id: spanContext.toSpanIdHex()
    }
  }

  extract (carrier) {
    if (!carrier || !carrier.signalfx || !carrier.signalfx.trace_id || !carrier.signalfx.span_id) {
      return null
    }

    const spanContext = new SignalFxSpanContext({
      traceId: new platform.Uint64BE(carrier.signalfx.trace_id, 16),
      spanId: new platform.Uint64BE(carrier.signalfx.span_id, 16)
    })

    return spanContext
  }
}

module.exports = LogPropagator
