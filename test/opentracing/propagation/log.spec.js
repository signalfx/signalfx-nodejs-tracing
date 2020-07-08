'use strict'

const platform = require('../../../src/platform')
const SpanContext = require('../../../src/opentracing/span_context')

describe('LogPropagator', () => {
  let LogPropagator
  let propagator
  let log

  beforeEach(() => {
    LogPropagator = require('../../../src/opentracing/propagation/log')
    propagator = new LogPropagator()
    log = {
      signalfx: {
        trace_id: 'bd2c0d1c675af6a8',
        span_id: '4201c352d6856b67'
      }
    }
  })

  describe('inject', () => {
    it('should inject the span context into the carrier', () => {
      const carrier = {}
      const spanContext = new SpanContext({
        traceId: new platform.Uint64BE('bd2c0d1c675af6a8', 16),
        spanId: new platform.Uint64BE('4201c352d6856b67', 16)
      })

      propagator.inject(spanContext, carrier)

      expect(carrier).to.deep.include({
        signalfx: {
          trace_id: 'bd2c0d1c675af6a8',
          span_id: '4201c352d6856b67'
        }
      })
    })
  })

  describe('extract', () => {
    it('should extract a span context from the carrier', () => {
      const carrier = log
      const spanContext = propagator.extract(carrier)

      expect(spanContext).to.deep.equal(new SpanContext({
        traceId: new platform.Uint64BE('bd2c0d1c675af6a8', 16),
        spanId: new platform.Uint64BE('4201c352d6856b67', 16)
      }))
    })

    it('should return null if the carrier does not contain a trace', () => {
      const carrier = {}
      const spanContext = propagator.extract(carrier)

      expect(spanContext).to.equal(null)
    })
  })
})
