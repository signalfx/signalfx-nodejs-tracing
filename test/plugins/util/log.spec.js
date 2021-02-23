'use strict'

wrapIt()

describe('plugins/util/log', () => {
  let log
  let tracer

  beforeEach(() => {
    tracer = require('../../..').init({
      service: 'test',
      plugins: false,
      zipkin: false,
      tags: { environment: 'test-env' },
      logInjectionTags: []
    })
    log = require('../../../src/plugins/util/log')
  })

  describe('correlate', () => {
    it('should attach the current scope trace identifiers to the log record', () => {
      const span = tracer.startSpan('test')

      tracer.scope().activate(span, () => {
        const record = log.correlate(tracer, {})

        expect(record).to.have.deep.property('signalfx', {
          trace_id: span.context().toTraceIdHex(),
          span_id: span.context().toSpanIdHex(),
          service: 'test'
        })
      })
    })

    it('should return a new correlated log record if one was not provided', () => {
      const span = tracer.startSpan('test')

      tracer.scope().activate(span, () => {
        const record = log.correlate(tracer)

        expect(record).to.have.deep.property('signalfx', {
          trace_id: span.context().toTraceIdHex(),
          span_id: span.context().toSpanIdHex(),
          service: 'test'
        })
      })
    })

    it('should do nothing if there is no active scope', () => {
      const record = log.correlate(tracer, {})

      expect(record).to.not.have.property('signalfx')
    })

    it('should do nothing if the active span is null', () => {
      tracer.scope().activate(null, () => {
        const record = log.correlate(tracer)

        expect(record).to.be.undefined
      })
    })

    it('should not alter the original object', () => {
      const span = tracer.startSpan('test')

      tracer.scope().activate(span, () => {
        const record = {}

        log.correlate(tracer, record)

        expect(record).to.not.have.property('signalfx')
      })
    })

    it('should add selected span tags to log record', () => {
      tracer._tracer._logInjectionTags.add('environment')

      const span = tracer.startSpan('test')

      tracer.scope().activate(span, () => {
        const record = log.correlate(tracer, {})

        expect(record).to.have.deep.property('signalfx', {
          trace_id: span.context().toTraceIdHex(),
          span_id: span.context().toSpanIdHex(),
          service: 'test',
          environment: 'test-env'
        })
      })
    })
  })
})
