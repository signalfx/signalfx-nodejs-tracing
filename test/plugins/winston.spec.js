'use strict'

const semver = require('semver')
const agent = require('./agent')
const plugin = require('../../src/plugins/winston')

wrapIt()

describe('Plugin', () => {
  let winston
  let tracer
  let transport
  let span

  function setup (version) {
    span = tracer.startSpan('test')

    winston = require(`../../versions/winston@${version}`).get()

    class Transport extends winston.Transport {}

    Transport.prototype.log = sinon.spy()

    transport = new Transport()

    if (winston.configure) {
      winston.configure({
        transports: [transport]
      })
    } else {
      winston.add(Transport)
      winston.remove(winston.transports.Console)
    }
  }

  describe('winston', () => {
    withVersions(plugin, 'winston', version => {
      beforeEach(() => {
        tracer = require('../..')
        return agent.load(plugin, 'winston')
      })

      afterEach(() => {
        return agent.close()
      })

      describe('without configuration', () => {
        beforeEach(() => {
          setup(version)
        })

        it('should not alter the default behavior', () => {
          const meta = {
            signalfx: {
              trace_id: span.context().toTraceIdHex(),
              span_id: span.context().toSpanIdHex()
            }
          }

          tracer.scope().activate(span, () => {
            winston.info('message')

            if (semver.intersects(version, '>=3')) {
              expect(transport.log).to.not.have.been.calledWithMatch(meta)
            } else {
              expect(transport.log).to.not.have.been.calledWithMatch('info', 'message', meta)
            }
          })
        })
      })

      describe('with configuration', () => {
        beforeEach(() => {
          tracer._tracer._logInjection = true
          setup(version)
        })

        it('should add the trace identifiers to the default logger', () => {
          const meta = {
            signalfx: {
              trace_id: span.context().toTraceIdHex(),
              span_id: span.context().toSpanIdHex(),
              service: tracer._tracer._service
            }
          }

          tracer.scope().activate(span, () => {
            winston.info('message')

            if (semver.intersects(version, '>=3')) {
              expect(transport.log).to.have.been.calledWithMatch(meta)
            } else {
              expect(transport.log).to.have.been.calledWithMatch('info', 'message', meta)
            }
          })
        })

        it('should add the trace identifiers to logger instances', () => {
          const options = {
            transports: [transport]
          }

          const meta = {
            signalfx: {
              trace_id: span.context().toTraceIdHex(),
              span_id: span.context().toSpanIdHex()
            }
          }

          const logger = winston.createLogger
            ? winston.createLogger(options)
            : new winston.Logger(options)

          tracer.scope().activate(span, () => {
            logger.info('message')

            if (semver.intersects(version, '>=3')) {
              expect(transport.log).to.have.been.calledWithMatch(meta)
            } else {
              expect(transport.log).to.have.been.calledWithMatch('info', 'message', meta)
            }
          })
        })

        if (semver.intersects(version, '>=3')) {
          it('should add the trace identifiers when streaming', () => {
            const logger = winston.createLogger({
              transports: [transport]
            })

            tracer.scope().activate(span, () => {
              logger.write({
                level: 'info',
                message: 'message'
              })

              expect(transport.log).to.have.been.calledWithMatch({
                signalfx: {
                  trace_id: span.context().toTraceIdHex(),
                  span_id: span.context().toSpanIdHex()
                }
              })
            })
          })
        }
      })
    })
  })
})
