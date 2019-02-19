'use strict'

const express = require('express')
const bodyParser = require('body-parser')
const getPort = require('get-port')

describe('zipkin-v2-json-dd-trace', () => {
  let tracer
  let agent
  let listener

  beforeEach(() => {
    tracer = require('../')

    return getPort().then(port => {
      agent = express()
      listener = agent.listen()

      tracer.init({
        service: 'test',
        port: listener.address().port,
        flushInterval: 0,
        plugins: false,
        path: '/my/collector/path',
        headers: { Authorization: 'Bearer Token' }
      })
    })
  })

  afterEach(() => {
    listener.close()
    delete require.cache[require.resolve('../')]
  })

  it('should record and send a trace to the agent', done => {
    let span
    const options = {
      resource: '/hello/:name'
    }

    agent.use(bodyParser.raw({ type: 'application/json' }))
    agent.post('/my/collector/path', (req, res) => {
      const payload = JSON.parse(req.body)
      expect(payload.length).to.be.equal(1)

      const zipkinSpan = payload.pop()
      expect(zipkinSpan.traceId).to.equal('0000000000000001')
      expect(zipkinSpan.parentId).to.equal('0000000000000002')
      expect(zipkinSpan.id).to.equal('0000000000000003')
      expect(zipkinSpan.localEndpoint.serviceName).to.equal('test')
      expect(zipkinSpan.name).to.equal('/hello/:name')
      expect(zipkinSpan.timestamp).to.be.equal(Math.round(span._startTime * 1000))
      expect(zipkinSpan.timestamp.toString().length).to.be.equal(16)
      expect(zipkinSpan.duration).to.be.equal(Math.round(span._duration * 1000))

      expect(req.headers.authorization).to.be.equal('Bearer Token')
      res.status(200).send('OK')

      done()
    })

    tracer.trace('hello', options, current => {
      span = current
      span._spanContext._traceId = 1
      span._spanContext._parentId = 2
      span._spanContext._spanId = 3
      current.finish()
    })
  })
})
