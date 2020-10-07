'use strict'

const Uint64BE = require('int64-buffer').Uint64BE

describe('NonReportingSpan', () => {
  let Span
  let span
  let tracer
  let recorder
  let prioritySampler
  let sampler
  let platform
  let handle

  beforeEach(() => {
    handle = { finish: sinon.spy() }
    platform = {
      id: sinon.stub(),
      metrics: sinon.stub().returns({
        track: sinon.stub().returns(handle)
      })
    }
    platform.id.onFirstCall().returns(new Uint64BE(123, 123))
    platform.id.onSecondCall().returns(new Uint64BE(456, 456))

    tracer = {}

    sampler = {
      rate: sinon.stub().returns(1)
    }

    recorder = {
      record: sinon.stub()
    }

    prioritySampler = {
      sample: sinon.stub()
    }

    Span = proxyquire('../src/opentracing/nonreporting_span', {
      '../platform': platform
    })
  })

  it('should have a default context', () => {
    span = new Span(tracer, recorder, sampler, prioritySampler, { operationName: 'operation' })

    expect(span.context()._traceId).to.deep.equal(new Uint64BE(123, 123))
    expect(span.context()._spanId).to.deep.equal(new Uint64BE(123, 123))
  })

  it('should not use a parent context', () => {
    const parent = {
      _traceId: new Uint64BE(555, 555),
      _spanId: new Uint64BE(666, 66),
      _baggageItems: { foo: 'bar' },
      _trace: {
        started: ['span'],
        finished: [],
        origin: 'synthetics'
      }
    }

    span = new Span(tracer, recorder, sampler, prioritySampler, { operationName: 'operation', parent })

    expect(span.context()._traceId).to.deep.equal(new Uint64BE(123, 123))
    expect(span.context()._parentId).to.deep.equal(null)
    expect(span.context()._baggageItems).to.deep.not.equal({ foo: 'bar' })
    expect(span.context()._trace).to.not.equal(parent._trace)
  })

  describe('finish', () => {
    it('should not add itself to the context trace finished spans', () => {
      recorder.record.returns(Promise.resolve())

      span = new Span(tracer, recorder, sampler, prioritySampler, { operationName: 'operation' })
      span.finish()

      expect(span.context()._trace.finished).to.deep.equal([])
    })

    it('should not record the span', () => {
      recorder.record.returns(Promise.resolve())

      span = new Span(tracer, recorder, sampler, prioritySampler, { operationName: 'operation' })
      span.finish()

      expect(recorder.record).to.have.been.callCount(0)
    })
  })
})
