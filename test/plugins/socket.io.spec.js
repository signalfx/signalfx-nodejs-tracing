'use strict'

const agent = require('./agent')
const plugin = require('../../src/plugins/socket.io')
const client = require('socket.io-client')

const socketUrl = 'http://localhost:5001'
const options = {
  transports: ['websocket'],
  forceNew: true,
  reconnection: false
}

const express = require('express')

wrapIt()

function setupApp (socketio) {
  const app = express()
  const http = require('http').Server(app)
  const io = socketio(http)

  // register a few callbacks on each new socket connection
  io.on('connection', (socket) => {
    socket.on('message', (message) => {
      io.sockets.emit('message', message)
    })

    socket.on('event', (message) => {
      io.sockets.emit('event', message)
    })
  })

  io.on('eventAll', (obj) => {
    io.sockets.emit('eventAll', obj)
  })

  return [http.listen(5001), io]
}

describe('Plugin', () => {
  let socket

  describe('socket.io', () => {
    withVersions(plugin, 'socket.io', version => {
      beforeEach(() => {
        socket = require(`../../versions/socket.io@${version}`).get()
      })

      afterEach(() => {
      })

      describe('without configuration', () => {
        let app
        let sender

        before(() => {
          return agent.load(plugin, 'socket.io')
        })

        after(() => {
          return agent.close()
        })

        beforeEach(() => {
          app = setupApp(socket)

          sender = client(socketUrl, options)
        })

        afterEach(() => {
          sender.disconnect()

          app[0].close()
        })

        it('should trace connect events', done => {
          agent.use(traces => {
            expect(traces[0][0]).to.have.property('name', 'emit connect')
            expect(traces[0][0].meta).to.have.property('component', 'socket.io')
            expect(traces[0][0].meta).to.have.property('namespace', '/')
            expect(traces[0][0].meta).to.have.property('path', '/socket.io')
            expect(traces[0][0].meta).to.have.property('clients.count', '1')
            expect(traces[0][0].meta).to.have.property('events.count', '2')
          }).then(done)
            .catch(done)
        })
      })

      describe('with reserved events omitted', () => {
        let app
        let sender

        before(() => {
          return agent.load(plugin, 'socket.io', { omitReserved: true })
        })

        after(() => {
          return agent.close()
        })

        beforeEach(() => {
          app = setupApp(socket)

          sender = client(socketUrl, options)
        })

        afterEach(() => {
          sender.disconnect()

          app[0].close()
        })

        it('should not trace reserved events', done => {
          sender.emit('message', 'testMessage')

          // the first trace sent should be message
          agent.use(traces => {
            expect(traces[0][0]).not.to.have.property('name', 'emit connect')
            expect(traces[0][0]).to.have.property('name', 'emit message')
            expect(traces[0][0].meta).to.have.property('component', 'socket.io')
            expect(traces[0][0].meta).to.have.property('namespace', '/')
            expect(traces[0][0].meta).to.have.property('path', '/socket.io')
            expect(traces[0][0].meta).to.have.property('clients.count', '1')
            expect(traces[0][0].meta).to.have.property('events.count', '2')
          }).then(done)
            .catch(done)
        })
      })

      describe('with specified events omitted', () => {
        let app
        let sender

        before(() => {
          return agent.load(plugin, 'socket.io', { omitReserved: true, omitEvents: ['message'] })
        })

        after(() => {
          return agent.close()
        })

        beforeEach(() => {
          app = setupApp(socket)

          sender = client(socketUrl, options)
        })

        afterEach(() => {
          sender.disconnect()

          app[0].close()
        })

        it('should not trace omitted events', done => {
          sender.emit('message', 'testMessage')
          sender.emit('event', 'testMessage')

          // the first trace sent should be event, not message
          agent.use(traces => {
            expect(traces[0][0]).to.have.property('name', 'emit event')
            expect(traces[0][0].meta).to.have.property('component', 'socket.io')
            expect(traces[0][0].meta).to.have.property('namespace', '/')
            expect(traces[0][0].meta).to.have.property('path', '/socket.io')
            expect(traces[0][0].meta).to.have.property('clients.count', '1')
            expect(traces[0][0].meta).to.have.property('events.count', '2')
          }).then(done)
            .catch(done)
        })
      })
    })
  })
})
