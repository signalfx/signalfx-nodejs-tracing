'use strict'

const Scope = require('../../src/scope/new/scope')
const Span = require('opentracing').Span

wrapIt()

describe('Promises', () => {
  let scope
  let spanOne
  let spanTwo
  let spanThree
  let expectOne
  let expectTwo
  let expectThree
  let expectNull

  beforeEach(() => {
    scope = new Scope()
    spanOne = new Span()
    spanTwo = new Span()
    spanThree = new Span()
    expectOne = () => { expect(scope.active()).to.equal(spanOne) }
    expectTwo = () => { expect(scope.active()).to.equal(spanTwo) }
    expectThree = () => { expect(scope.active()).to.equal(spanThree) }
    expectNull = () => { expect(scope.active()).to.be.null }
  })

  describe('Nested promises', () => {
    it('bind should set active for then, with Promise inheriting current active', done => {
      let innerBoundToTwo
      let outerBoundToTwo
      expectNull()

      const test = new Promise(resolve => {
        scope.activate(spanOne, () => {
          Promise.resolve().then(expectOne).then(expectOne).catch(done)
          Promise.reject(new Error('test')).then(null, scope.bind(expectOne)).then(expectOne).catch(done)
          Promise.resolve().then(() => setImmediate(expectOne)).then(expectOne).catch(done)

          const boundToThree = scope.bind(Promise.resolve(), spanThree)
          const boundToTwo = scope.bind(boundToThree.then(expectThree), spanTwo)
          boundToTwo.then(expectTwo).then(expectOne).then(expectOne).catch(done)

          scope.activate(spanThree, () => {
            const boundToOne = scope.bind(Promise.resolve(), spanOne)
            const alsoBoundToTwo = scope.bind(boundToOne.then(expectOne), spanTwo)
            alsoBoundToTwo.then(expectTwo).then(expectThree).then(expectThree).catch(done)

            const alsoBoundToOne = scope.bind(Promise.all([Promise.resolve(), Promise.resolve()]), spanOne)
            alsoBoundToOne.then(expectOne).then(expectThree).catch(done)

            outerBoundToTwo = new Promise((resolve, reject) => {
              expectThree()

              scope.activate(spanOne, () => {
                expectOne()
                scope.bind(expectOne)()
                setImmediate(expectOne)

                scope.activate(spanTwo, expectTwo)
                scope.activate(spanThree, expectThree)

                innerBoundToTwo = Promise.resolve()
                scope.bind(innerBoundToTwo, spanTwo)

                setImmediate(() => {
                  setImmediate(expectOne)
                  scope.bind(expectOne)()

                  scope.activate(spanTwo, expectTwo)
                  scope.activate(spanThree, expectThree)

                  setImmediate(() => {
                    setImmediate(() => {
                      expectOne()
                      scope.bind(expectOne)()
                      setImmediate(() => {
                        expectOne()
                        resolve()
                      })
                    })
                  })
                })

                expectOne()
                scope.bind(expectOne)()
                setImmediate(expectOne)
              })
            })

            scope.bind(outerBoundToTwo, spanTwo)
            outerBoundToTwo.then(expectTwo).then(expectThree).catch(done)
            expectThree()
            resolve()
          })

          expectOne()
        })
      })

      expectNull()
      innerBoundToTwo.then(expectTwo).then(expectNull).catch(done)
      test.then(expectNull).then(done).catch(done)
    })
  })
})
