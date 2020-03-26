'use strict'

const agent = require('./agent')
const plugin = require('../../src/plugins/sails')

wrapIt()

describe('Plugin', () => {
  let tracer
  let Sails

  describe('sails', () => {
    withVersions(plugin, 'sails', version => {
      beforeEach(() => {
        tracer = require('../..')
      })

      before(() => {
        return agent.load(plugin, 'sails').then(() => {
          Sails = require(`../../versions/sails@${version}`).get()
          Sails.config = {}
          // Sails.load({environment: 'production'})
        })
      })

      after(() => {
        Sails.lower()

        agent.close()
      })

      it('traces classic actions registered via registerAction', done => {
        Sails.registerAction(() => { return 'test response' }, 'testAction')

        agent.use(traces => {
          expect(traces[0][0]).to.have.property('name', 'action testAction')
          expect(traces[0][0]).to.have.property('service', 'test')
          expect(traces[0][0].meta).to.have.property('component', 'Sails.js')
          expect(traces[0][0].meta).to.have.property('span.kind', 'server')
        }).then(done)
          .catch(done)

        expect(Sails.getActions()['testaction']()).to.eq('test response')
      })

      it('traces actions2 actions registered via registerAction', done => {
        const mockRes = () => {
          const res = {}
          res.status = sinon.stub().returns(res)
          res.json = sinon.stub().returns(res)
          res.send = sinon.stub().returns(res)
          res.sendStatus = sinon.stub().returns(res)
          res.set = sinon.stub().returns(res)
          return res
        }
        const functionToTrace = sinon.stub()
        const action2dict = {
          fn: functionToTrace
        }

        Sails.registerAction(action2dict, 'testAction2')

        agent.use(traces => {
          expect(traces[0][0]).to.have.property('name', 'action testAction2')
          expect(traces[0][0]).to.have.property('service', 'test')
          expect(traces[0][0].meta).to.have.property('component', 'Sails.js')
          expect(traces[0][0].meta).to.have.property('span.kind', 'server')
        }).then(done)
          .catch(done)

        expect(Sails.getActions()['testaction2']({}, mockRes()))
        expect(functionToTrace).to.have.been.called
      })

      it('traces single actions registered via registerActionMiddleware', done => {
        Sails.registerActionMiddleware(() => { return 'test response' }, 'testAction')

        agent.use(traces => {
          expect(traces[0][0]).to.have.property('name', 'action testAction')
          expect(traces[0][0]).to.have.property('service', 'test')
          expect(traces[0][0].meta).to.have.property('component', 'Sails.js')
          expect(traces[0][0].meta).to.have.property('span.kind', 'server')
        }).then(done)
          .catch(done)

        expect(Sails.getActions()['testaction']()).to.eq('test response')
      })

      it('traces arrays of actions registered via registerActionMiddleware', done => {
        const actions = [
          function () {
            return 'test response'
          }
        ]
        Sails.registerActionMiddleware(actions, 'testAction')

        agent.use(traces => {
          expect(traces[0][0]).to.have.property('name', 'action testAction')
          expect(traces[0][0]).to.have.property('service', 'test')
          expect(traces[0][0].meta).to.have.property('component', 'Sails.js')
          expect(traces[0][0].meta).to.have.property('span.kind', 'server')
        }).then(done)
          .catch(done)

        expect(Sails.getActions()['testaction']()).to.eq('test response')
      })

      it('tags errors from the action', done => {
        Sails.registerAction(() => { throw new Error('fake error') }, 'testActionWithError')

        agent.use(traces => {
          expect(traces[0][0]).to.have.property('name', 'action testActionWithError')
          expect(traces[0][0]).to.have.property('service', 'test')
          expect(traces[0][0].meta).to.have.property('component', 'Sails.js')
          expect(traces[0][0].meta).to.have.property('span.kind', 'server')
          expect(traces[0][0].meta).to.have.property('error', 'true')
          expect(traces[0][0].meta).to.have.property('sfx.error.kind', 'Error')
          expect(traces[0][0].meta).to.have.property('sfx.error.object', 'Error')
          expect(traces[0][0].meta).to.have.property('sfx.error.message', 'fake error')
          expect(traces[0][0].meta).to.have.property('sfx.error.stack')
        }).then(done)
          .catch(done)

        try {
          Sails.getActions()['testactionwitherror']()
        } catch (e) {
          expect(e.message).to.eq('fake error')
        }
      })

      it('propagates context', done => {
        Sails.registerAction(() => { return 'actionWithPropagation' }, 'testActionWithPropagation')

        const span = tracer.startSpan('parent span')
        const scope = tracer.scope()

        scope.bind(Sails)
        scope.activate(span, () => {
          agent.use(traces => {
            expect(traces[0][0]).to.have.property('name', 'action testActionWithPropagation')
            expect(traces[0][0]).to.have.property('service', 'test')
            expect(traces[0][0]).to.have.property('parent_id', traces[0][1].trace_id)
            expect(traces[0][0].meta).to.have.property('component', 'Sails.js')
            expect(traces[0][0].meta).to.have.property('span.kind', 'server')
          })
            .then(done)
            .catch(done)

          Sails.getActions()['testactionwithpropagation']()
        })

        span.finish()
      })
    })
  })
})
