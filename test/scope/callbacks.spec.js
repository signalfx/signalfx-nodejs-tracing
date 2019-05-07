'use strict'

const Scope = require('../../src/scope/new/scope')
const Span = require('opentracing').Span

wrapIt()

describe('Callbacks', () => {
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

  describe('Nested callbacks with multiple spans', () => {
    it('activate should set active for callbacks without affecting parent context', done => {
      expectNull()
      scope.activate(spanOne, () => {
        expectOne()
        scope.bind(expectOne)()
        setImmediate(expectOne)

        scope.activate(spanTwo, () => {
          expectTwo()
          scope.bind(expectTwo)()
          setImmediate(expectTwo)
        })

        scope.activate(spanThree, () => {
          expectThree()
          scope.bind(expectThree)()
          setImmediate(expectThree)

          scope.activate(spanOne, () => {
            setImmediate(expectOne)

            scope.activate(spanTwo, expectTwo)
            scope.bind(expectThree, spanThree)()

            setImmediate(() => {
              scope.bind(expectOne)()
              scope.bind(expectTwo, spanTwo)()
              scope.activate(spanThree, expectThree)

              function finish () {
                expectOne()
                scope.bind(expectOne)()
                scope.activate(spanThree, () => {
                  setImmediate(() => {
                    expectThree()
                    done()
                  })
                })
              }

              function loop (count) {
                if (count === 100) {
                  return setImmediate(finish)
                }
                expectOne()
                scope.bind(expectTwo, spanTwo)()
                scope.activate(spanThree, expectThree)
                setImmediate(() => { loop(count + 1) })
              }

              loop(1)
            })

            expectOne()
            scope.bind(expectOne)()
            setImmediate(expectOne)
          })

          expectThree()
          scope.bind(expectThree)()
          setImmediate(expectThree)
        })

        expectOne()
        scope.bind(expectOne)()
        setImmediate(expectOne)
      })
      expectNull()
    })

    it('Active span should be of calling context despite where function defined', done => {
      let definedInOne
      let definedInTwo
      expect(scope.active()).to.be.null
      scope.activate(spanOne, () => {
        definedInOne = () => { setImmediate(expectNull) }

        function activeSpanTest () {
          expectNull()
          scope.activate(spanTwo, () => {
            setImmediate(expectTwo)
            definedInTwo = () => {
              setImmediate(() => {
                expectNull()
                done()
              })
            }
          })
        }

        global.activeSpanTest = activeSpanTest
      })
      global.activeSpanTest()
      definedInOne()
      definedInTwo()
    })
  })
})
