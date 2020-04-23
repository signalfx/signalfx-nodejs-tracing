# SignalFx Tracing Library for JavaScript - API

The SignalFx Tracing Library for JavaScript exports an OpenTracing
[tracer](https://doc.esdoc.org/github.com/opentracing/opentracing-javascript/class/src/tracer.js~Tracer.html).
The library implements a [scope manager](https://github.com/opentracing/specification/blob/10497dfe0ffef806e97ccf3173ebbeba83f401be/rfc/scope_manager.md), which isn't currently in the OpenTracing JavaScript reference API, but the
development is ongoing.

The library uses [`require-in-the-middle`](https://www.npmjs.com/package/require-in-the-middle)
and [`shimmer`](https://www.npmjs.com/package/shimmer) to instrument your Node.js application.

For information about steps for the express configuration to automatically instrument an application,
see [SignalFx Tracing Library for JavaScript](/README.md).

## Manually instrument a Node.js application

In addition to instrumentation the SignalFx Tracing Library for JavaScript
provides, you can add custom instrumentation to your application with the
[OpenTracing API](#opentracing-api) and [Scope](#scope) manager.

Because a number of helpful methods aren't provided by the current OpenTracing
JavaScript API, the delegation pattern of the OpenTracing global tracer
(`require('opentracing').globalTracer()`) isn't fully compatible with our tracer
instances. As a result, you need to reference the actual tracer instance
returned by `init()` where custom instrumentation utilizes scope management
and manual trace reporting.

### Use the OpenTracing API with the SignalFx Tracing Library for JavaScript

You can use the [OpenTracing API](https://doc.esdoc.org/github.com/opentracing/opentracing-javascript/)
and the SignalFx Tracing Library for JavaScript to track execution state and
duration for specific pieces of code. 

Initialize a tracer and register it as an OpenTracing global tracer:

```javascript
const tracer = require('signalfx-tracing').init()
const opentracing = require('opentracing')

opentracing.initGlobalTracer(tracer)

function myApplicationLogic() {
  // This tracer delegate only supports the base OpenTracing API
  const globalTracer =  opentracing.globalTracer()
  const span = globalTracer.startSpan('myApplicationLogic') 
  span.setTag('MyTag', 'MyTagValue')
  span.log({ event: 'Event Information' })

  // callback that will finish the current span upon completion
  return myAdditionalApplicationLogic(result => {
    span.setTag('MyResult', result)
    span.finish()
  })

}
```

### Use the Scope manager with the SignalFx Tracing Library for JavaScript

To provide span context propagation within a Node.js application, the library
includes a scope manager. A scope manager is a utility for registering and
providing a span that can cross both synchronous and asynchronous contexts.
The span it provides is registered as active, and you can use it for noting an
accessor's execution state and for parenting child spans. This means you can
reference an existing span in a particular section of traced functionality
without already explicitly passing the span as an argument.

The scope manager is available via `tracer.scope()`. Use its return value in a
global context. It has three methods for active span management:

* scope.active()
* scope.activate(span, fn)
* scope.bind(target, [span])

Because the scope manager isn't defined in the current OpenTracing JavaScript
API, the delegation pattern of the OpenTracing global tracer
(`require('opentracing').globalTracer()`) can't provide access to the
scope manager via the `scope()` method. 

As a result, a reference to the tracer instance returned by `init()` should be
made accessible where manual scope management is necessary:

```javascript
// explicit span reference as parameter
function myApplicationLogic (argOne, activeSpan) {
  activeSpan.setTag('MyArg', argOne)

  return myAdditionalApplicationLogic(result => {
    activeSpan.setTag('MyResult', result)
    activeSpan.finish()
  })
}
```

Automatically propagate context with the scope manager after you initialize
the tracer:

```javascript
const tracer = require('signalfx-tracing').init()

function myApplicationLogic (argOne) {
  activeSpan = tracer.scope().active()
  activeSpan.setTag('MyArg', argOne)

  return myAdditionalApplicationLogic(result => {
    activeSpan.setTag('MyResult', result)
    activeSpan.finish()
  })
}
```

You can export the tracer for other modules afterward.

#### scope.active()

This method returns the active span for the current function if one has been
earlier activated in some outer or local context.  Returns `null` otherwise.

#### scope.activate(span, fn)

This method activates the provided span in the tracer's scope for availability
in the context of the provided function, which is immediately invoked.  Any
asynchronous context stemming from the provided function will also have access
to the span by calls to `scope.active()`. The return value of `activate()` is
that of the provided function.

```javascript
const tracer = require('signalfx-tracing').init()
const scope = tracer.scope()

const requestSpan = tracer.startSpan('web.request')
const promise = Promise.resolve()

function someFunction () {
  // Logs the current active span
  console.log(scope.active())
}

scope.activate(requestSpan, () => {
  console.log(scope.active()) // requestSpan because called in activated context

  someFunction() // requestSpan because called in activated context

  setTimeout(() => {
    setTimeout(() => {
      console.log(scope.active()) // requestSpan because setTimeout calls stem from activated context
    })
  })

  promise.then(() => {
    console.log(scope.active()) // requestSpan because then() called in activated context
  })
})

someFunction() // null because called in an unactivated context
console.log(scope.active()) // null
```

#### scope.bind(target, [span])

This method binds a target to the specified span, or to an active span if absent.
It supports binding functions, promises, and event emitters.  When a span is
provided, the target is always bound to that span. If a span isn't specified,
the bound active span will depend on the type of the provided target
(detailed below).

Explicitly passing `null` as the span value will actually bind to `null` or no
span. This can be useful if isolated trace content is desired without modifying
the active span of the current trace context.

The return value of binding a function will be a traced wrapper of that
function. It's important to note that the returned function is not the same
function in terms of identity and comparisons, but it can be treated as if it
were otherwise.

The return value of binding a promise is the target promise, but its `then` and
`catch` methods are traced equivalents. As with wrapped functions, these methods
are not the same as they were before `bind()` but can be treated as such outside
of direct comparison.

The return value of binding an event emitter is the target emitter but it will
have had its relevant listener registration and handling methods replaced with
traced equivalents.

When a span is not provided to `bind()`, the binding uses the following rules
for determining the active span that will be bound:

* Functions are bound to the span that was active when `scope.bind(fn)` was called.
* Promise handlers are bound to the active span in the scope where `.then()` is
called. This also applies to any equivalent method such as `.catch()`.  This is the case
because implicit promises are created by these methods that assume the active span from the
current scope.
* Event emitter listeners are bound to the active span in the scope where
`.addEventListener()` is called. This also applies to any equivalent method
such as `.on()`

By default, native promises and promises from `bluebird`, `q` and `when` are
already bound to the active span in activated contexts and don't need to be
explicitly bound.

##### Function binding example

```javascript
const tracer = require('signalfx-tracing').init()
const scope = tracer.scope()

const outerSpan = tracer.startSpan('web.request')

scope.activate(outerSpan, () => {
  const innerSpan = tracer.startSpan('web.middleware')

  const boundToInner = scope.bind(() => {
    console.log(scope.active())
  }, innerSpan)

  const boundToOuter = scope.bind(() => {
    console.log(scope.active())
  })

  boundToInner() // innerSpan because explicitly bound
  boundToOuter() // outerSpan because implicitly bound
})
```

##### Promise binding example

`async/await` can't be bound and always executes in the scope where
`await` was called. If binding `async/await` is needed, the promise must be
wrapped by a function.

```javascript
const tracer = require('signalfx-tracing').init()
const scope = tracer.scope()

const outerSpan = tracer.startSpan('web.request')
const innerPromise = Promise.resolve()
const outerPromise = Promise.resolve()

scope.activate(outerSpan, () => {
  const innerSpan = tracer.startSpan('web.middleware')

  scope.bind(innerPromise, innerSpan)
  scope.bind(outerPromise)

  innerPromise.then(() => {
    console.log(scope.active()) // innerSpan because it was explicitly bound
  })

  outerPromise.then(() => {
    console.log(scope.active()) // outerSpan because implicitly bound on `then()` call
  })
})
```

##### Event emitter binding example

```javascript
const tracer = require('signalfx-tracing').init()
const scope = tracer.scope()
const EventEmitter = require('events').EventEmitter

const outerSpan = tracer.startSpan('web.request')
const innerEmitter = new EventEmitter()
const outerEmitter = new EventEmitter()

scope.activate(outerSpan, async () => {
  const innerSpan = tracer.startSpan('web.middleware')

  scope.bind(innerEmitter, innerSpan)
  scope.bind(outerEmitter)

  innerEmitter.on('request', () => {
    console.log(scope.active()) // innerSpan because it was explicitly bound
  })

  outerEmitter.on('request', () => {
    console.log(scope.active()) // outerSpan because implicitly bound on `on()` call
  })
})

innerEmitter.emit('request')
outerEmitter.emit('request')
```

## Manually report traces

If reporting all enqueued traces is necessary, you can manually flush the
internal tracer writer is possible. The tracer's `flush()` method will return
the writer's request promise that represents the trace submission to the
SignalFx Smart Agent or OpenTelemetry Collector.

```javascript
const tracer = require('signalfx-tracing').init();

// <...traced activity...>

// Report any unsent traces before pausing.
tracer.flush().then(() => { console.log('ready to suspend') });
```

## Enable debug logging

By default, logging from this library is disabled. To send debbuging
information and errors logs, the `debug` options should be set to `true` in
the `init()` method.

The tracer logs debug information to `console.log()` and errors to
`console.error()`. Change this behavior by passing a custom logger to
the tracer. The logger should contain a `debug()` and `error()` methods that
can handle messages and errors, respectively.

Here's an example illustrating how you can enable debug logging:

```javascript
const bunyan = require('bunyan')
const logger = bunyan.createLogger({
  name: 'signalfx-tracing',
  level: 'trace'
})

const tracer = require('signalfx-tracing').init({
  logger: {
    debug: message => logger.trace(message),
    error: err => logger.error(err)
  },
  debug: true
})
```
