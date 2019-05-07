'use strict'

const Scope = require('../../../src/scope/new/scope')
const Span = require('opentracing').Span

wrapIt()

describe('Async Functions', () => {
  let scope
  let spanOne
  let spanTwo
  let spanThree
  let expectOne
  let expectTwo
  let expectThree

  beforeEach(() => {
    scope = new Scope()
    spanOne = new Span()
    spanTwo = new Span()
    spanThree = new Span()
    expectOne = async () => { await expect(scope.active()).to.equal(spanOne) }
    expectTwo = async () => { await expect(scope.active()).to.equal(spanTwo) }
    expectThree = async () => { await expect(scope.active()).to.equal(spanThree) }
  })

  describe('Nested async functions', () => {
    it('should assume active from calling context', done => {
      scope.activate(spanOne, () => {
        async function one () {
          await expect(scope.active()).to.be.null
        }
        global.one = one
      })
      global.one()

      async function two () {
        scope.activate(spanOne, async () => {
          await expectOne()
          await scope.bind(expectOne)()
          await setImmediate(expectOne)

          scope.activate(spanTwo, async () => {
            expectTwo()
            scope.bind(expectTwo)()
            await setImmediate(expectTwo)
          })

          await scope.activate(spanThree, async () => {
            expectThree()
            scope.bind(expectThree)()
            await setImmediate(expectThree)

            scope.activate(spanOne, async () => {
              expectOne()
              scope.bind(expectOne)()
              setImmediate(expectOne)

              scope.activate(spanTwo, async () => { await expectTwo() })
              await scope.activate(spanThree, async () => { await expectThree() })

              setImmediate(async () => {
                setImmediate(expectOne)
                await scope.bind(expectOne)()

                scope.activate(spanTwo, async () => { await expectTwo() })
                scope.activate(spanThree, async () => { await expectThree() })

                setImmediate(() => {
                  setImmediate(() => {
                    expectOne()
                    scope.bind(expectOne)()
                    setImmediate(async () => {
                      await expectOne()
                      done()
                    })
                  })
                })
              })

              expectOne()
              scope.bind(expectOne)()
              setImmediate(expectOne)
            })

            expectThree()
            scope.bind(expectThree)()
            setImmediate(expectThree)
          })

          await expectOne()
          await scope.bind(expectOne)()
          setImmediate(expectOne)
        })
      }
      two().then(global.one)
      global.one()
    })
  })
})
