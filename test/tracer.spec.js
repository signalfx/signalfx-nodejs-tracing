'use strict'

const Span = require('opentracing').Span
const NonReportingSpan = require('../src/opentracing/nonreporting_span')
const Config = require('../src/config')
const tags = require('../ext/tags')
const _truncate = require('lodash.truncate')

const SPAN_TYPE = tags.SPAN_TYPE
const RESOURCE_NAME = tags.RESOURCE_NAME
const SERVICE_NAME = tags.SERVICE_NAME
const ANALYTICS = tags.ANALYTICS

wrapIt()

describe('Tracer', () => {
  let Tracer
  let tracer
  let config
  let instrumenter
  let Instrumenter

  beforeEach(() => {
    config = new Config('test', { service: 'service' })

    instrumenter = {
      use: sinon.spy(),
      patch: sinon.spy()
    }
    Instrumenter = sinon.stub().returns(instrumenter)

    Tracer = proxyquire('../src/tracer', {
      './instrumenter': Instrumenter
    })

    tracer = new Tracer(config)
  })

  describe('withNonReportingScope', () => {
    it('should create disabled spans inside the scope', () => {
      const result = tracer.withNonReportingScope(() => {
        tracer.trace('name', {}, span => {
          expect(span).to.be.instanceof(NonReportingSpan)
        })
        return '1234'
      })
      expect(result).to.equal('1234')
    })
  })

  describe('trace', () => {
    it('should run the callback with a new span', () => {
      tracer.trace('name', {}, span => {
        expect(span).to.be.instanceof(Span)
        expect(span.context()._name).to.equal('name')
      })
    })

    it('should accept options', () => {
      const options = {
        service: 'service',
        resource: 'resource',
        type: 'type',
        tags: {
          foo: 'bar'
        }
      }

      tracer.trace('name', options, span => {
        expect(span).to.be.instanceof(Span)
        expect(span.context()._tags).to.include(options.tags)
        expect(span.context()._tags).to.include({
          [SERVICE_NAME]: 'service',
          [RESOURCE_NAME]: 'resource',
          [SPAN_TYPE]: 'type'
        })
      })
    })

    it('should support analytics', () => {
      tracer.trace('name', { analytics: 0.5 }, span => {
        expect(span.context()._tags).to.have.property(ANALYTICS, 0.5)
      })
    })

    it('should activate the span', () => {
      tracer.trace('name', {}, span => {
        expect(tracer.scope().active()).to.equal(span)
      })
    })

    it('should start the span as a child of the active span', () => {
      const childOf = tracer.startSpan('parent')

      tracer.scope().activate(childOf, () => {
        tracer.trace('name', {}, span => {
          expect(span.context()._parentId.toString()).to.equal(childOf.context().toSpanId())
        })
      })
    })

    it('should allow overriding the parent span', () => {
      const root = tracer.startSpan('root')
      const childOf = tracer.startSpan('parent')

      tracer.scope().activate(root, () => {
        tracer.trace('name', { childOf }, span => {
          expect(span.context()._parentId.toString()).to.equal(childOf.context().toSpanId())
        })
      })
    })

    it('should return the value from the callback', () => {
      const result = tracer.trace('name', {}, span => 'test')

      expect(result).to.equal('test')
    })

    it('should finish the span', () => {
      let span

      tracer.trace('name', {}, (_span) => {
        span = _span
        sinon.spy(span, 'finish')
      })

      expect(span.finish).to.have.been.called
    })

    it('should accept SIGNALFX_SPAN_TAGS', () => {
      process.env.SIGNALFX_SPAN_TAGS = 'key.1:val1,nocolon,:emptykey,emptyval:,too:many:pieces, key.2 : val2 '
      config = new Config('test', { service: 'service' })
      tracer = new Tracer(config)
      delete process.env.SIGNALFX_SPAN_TAGS
      const span = tracer.startSpan('name', {})
      expect(span.context()._tags).to.include({
        'key.1': 'val1',
        'key.2': 'val2'
      })
      span.finish()
    })

    it('should handle exceptions', () => {
      let span
      let tags

      try {
        tracer.trace('name', {}, _span => {
          span = _span
          tags = span.context()._tags
          sinon.spy(span, 'finish')
          throw new Error('boom')
        })
      } catch (e) {
        expect(span.finish).to.have.been.called
        expect(tags).to.include({
          'sfx.error.kind': e.name,
          'sfx.error.message': e.message,
          'sfx.error.stack': _truncate(e.stack, { length: 1200 })
        })
      }
    })

    describe('with a callback taking a callback', () => {
      it('should wait for the callback to be called before finishing the span', () => {
        let span
        let done

        tracer.trace('name', {}, (_span, _done) => {
          span = _span
          sinon.spy(span, 'finish')
          done = _done
        })

        expect(span.finish).to.not.have.been.called

        done()

        expect(span.finish).to.have.been.called
      })

      it('should handle errors', () => {
        const error = new Error('boom')
        let span
        let done
        let tags

        tracer.trace('name', {}, (_span, _done) => {
          span = _span
          tags = span.context()._tags
          sinon.spy(span, 'finish')
          done = _done
        })

        done(error)

        expect(span.finish).to.have.been.called
        expect(tags).to.include({
          'sfx.error.kind': error.name,
          'sfx.error.message': error.message,
          'sfx.error.stack': _truncate(error.stack, { length: 1200 })
        })
      })
    })

    describe('with a callback returning a promise', () => {
      it('should wait for the promise to resolve before finishing the span', done => {
        const deferred = {}
        const promise = new Promise(resolve => {
          deferred.resolve = resolve
        })

        let span

        tracer
          .trace('name', {}, _span => {
            span = _span
            sinon.spy(span, 'finish')
            return promise
          })
          .then(() => {
            expect(span.finish).to.have.been.called
            done()
          })
          .catch(done)

        expect(span.finish).to.not.have.been.called

        deferred.resolve()
      })

      it('should handle rejected promises', done => {
        let span
        let tags

        tracer
          .trace('name', {}, _span => {
            span = _span
            tags = span.context()._tags
            sinon.spy(span, 'finish')
            return Promise.reject(new Error('boom'))
          })
          .catch(e => {
            expect(span.finish).to.have.been.called
            expect(tags).to.include({
              'sfx.error.kind': e.name,
              'sfx.error.message': e.message,
              'sfx.error.stack': e.stack.substring(0, 1197) + '...'
            })
            done()
          })
          .catch(done)
      })
    })
  })

  describe('wrap', () => {
    it('should return a new function that automatically calls tracer.trace()', () => {
      const it = {}
      const callback = sinon.spy(function (foo) {
        expect(tracer.scope().active()).to.not.be.null
        expect(this).to.equal(it)
        expect(foo).to.equal('foo')

        return 'test'
      })
      const fn = tracer.wrap('name', {}, callback)

      sinon.spy(tracer, 'trace')

      const result = fn.call(it, 'foo')

      expect(callback).to.have.been.called
      expect(tracer.trace).to.have.been.calledWith('name', {})
      expect(result).to.equal('test')
    })

    it('should wait for the callback to be called before finishing the span', done => {
      const fn = tracer.wrap('name', {}, sinon.spy(function (cb) {
        const span = tracer.scope().active()

        sinon.spy(span, 'finish')

        setImmediate(() => {
          expect(span.finish).to.not.have.been.called
        })

        setImmediate(() => cb())

        setImmediate(() => {
          expect(span.finish).to.have.been.called
          done()
        })
      }))

      sinon.spy(tracer, 'trace')

      fn(() => {})
    })
  })
})
