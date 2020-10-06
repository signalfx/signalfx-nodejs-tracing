'use strict'

const platform = require('../platform')
const Span = require('./span')
const SpanContext = require('./nonreporting_span_context')

class SignalFxNonReportingSpan extends Span {
  _createContext (_) {
    const spanId = platform.id()
    const spanContext = new SpanContext({
      traceId: spanId,
      spanId
    })
    return spanContext
  }

  _finish (finishTime) {
    if (this._duration !== undefined) {
      return
    }

    finishTime = parseFloat(finishTime) || platform.now()
    this._duration = finishTime - this._startTime
    this._spanContext._isFinished = true
    this._handle.finish()
  }
}

module.exports = SignalFxNonReportingSpan
