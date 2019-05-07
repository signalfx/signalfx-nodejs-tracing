'use strict'

const Scope = require('../../src/scope/new/scope')
const Span = require('opentracing').Span
const EventEmitter = require('events').EventEmitter
const semver = require('semver')

wrapIt()

describe('Events', () => {
  let scope
  let spanOne
  let spanTwo
  let spanThree
  let expectOne
  let expectThree

  beforeEach(() => {
    scope = new Scope()
    spanOne = new Span()
    spanTwo = new Span()
    spanThree = new Span()
    expectOne = () => { expect(scope.active()).to.equal(spanOne) }
    expectThree = () => { expect(scope.active()).to.equal(spanThree) }
  })

  describe('EventEmitters', () => {
    it('should set active for listeners when bound and assume context otherwise', done => {
      const boundToOneInside = new EventEmitter()
      expect(scope.active()).to.be.null
      const test = new Promise(resolve => {
        scope.activate(spanOne, () => {
          let expected = spanOne
          const dynamicExpect = () => { expect(scope.active()).to.equal(expected) }

          const implicitOne = new EventEmitter()
          implicitOne.on('test', expectOne)
          implicitOne.emit('test')

          let implicitTwo
          scope.activate(spanTwo, () => {
            implicitTwo = new EventEmitter()
            expected = spanTwo
            if (semver.satisfies(process.version, '>=6')) {
              implicitTwo.prependListener('test', dynamicExpect)
            } else {
              implicitTwo.addListener('test', dynamicExpect)
            }
            implicitTwo.emit('test')
          })
          // Unbound EventEmitter's listener assume currently active span
          expected = spanOne
          implicitTwo.emit('test')

          scope.activate(spanThree, () => {
            expected = spanThree
            implicitTwo.emit('test')

            const explicitOne = new EventEmitter()
            scope.bind(explicitOne, spanOne)
            expectThree() // binding EventEmitter doesn't affect active span

            explicitOne.once('test', expectOne)
            explicitOne.emit('test')

            scope.bind(explicitOne, spanTwo) // rebinding isn't possible
            scope.activate(spanOne, () => {
              expectOne()
              expected = spanOne
              implicitTwo.emit('test')

              if (semver.satisfies(process.version, '>=6')) {
                explicitOne.prependOnceListener('test', expectOne)
              } else {
                explicitOne.once('test', expectOne)
              }

              explicitOne.emit('test')

              setImmediate(() => {
                setImmediate(() => {
                  setImmediate(() => {
                    implicitTwo.emit('test')
                    expectOne()
                    scope.bind(boundToOneInside)
                    boundToOneInside.on('test', expectOne)
                    boundToOneInside.on('done', done)
                    resolve()
                  })
                })
              })
              expectOne()
            })
            expectThree()
          })
          expectOne()
        })
      })
      test.then(() => {
        expect(scope.active()).to.be.null
        boundToOneInside.emit('test')
        boundToOneInside.emit('test')
        boundToOneInside.emit('done')
      })
    })
  })
})
