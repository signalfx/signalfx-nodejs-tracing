# SignalFx-Tracing Library for JavaScript - API

The module exported by the `signalfx-tracing` library is an OpenTracing [Tracer](https://doc.esdoc.org/github.com/opentracing/opentracing-javascript/class/src/tracer.js~Tracer.html).  It has been modified to implement a [Scope Manager](https://github.com/opentracing/specification/blob/10497dfe0ffef806e97ccf3173ebbeba83f401be/rfc/scope_manager.md), which is not currently in the OpenTracing JavaScript reference API, but whose development is ongoing.

### Auto-Instrumentation

The SignalFx-Tracing Library for JavaScript provides auto-instrumentation for all its supported libraries and frameworks using [`require-in-the-middle`](https://www.npmjs.com/package/require-in-the-middle) and [`shimmer`](https://www.npmjs.com/package/shimmer).  To utilize this functionality, the tracer must be accessed and initialized before any target library or framework is imported:

```javascript
// init() invocation must occur before importing any traced library (e.g. Express)
const tracer = require('signalfx-tracing').init(
  service: 'my-traced-service',  // also via SIGNALFX_SERVICE_NAME environment variable
  url: 'http://my_agent_or_gateway:9080/v1/trace',  // also via SIGNALFX_ENDPOINT_URL environment variable
  accessToken: 'myOptionalOrganizationAccessToken' // also via SIGNALFX_ACCESS_TOKEN environment variable
)

// auto-instrumented Express application
const express = require('express') 
const app = express()
```

### Manual Instrumentation

Regardless if you are using a [supported library instrumentation](#instrumentations), you may want to manually instrument your code.  This can be done using the [OpenTracing API](#opentracing-api) and the [Scope Manager](#scope-manager).

#### OpenTracing API

You can use the [OpenTracing API](https://doc.esdoc.org/github.com/opentracing/opentracing-javascript/) and the `signalfx-tracing` library to track execution state and duration for specific pieces of code. In the following example, a tracer is initialized and used as an OpenTracing global tracer:

```javascript
const tracer = require('signalfx-tracing').init()
const opentracing = require('opentracing')

opentracing.initGlobalTracer(tracer)

function myApplicationLogic() {
  const globalTracer =  opentracing.globalTracer()
  const span = globalTracer.startSpan('myApplicationLogic') 
  span.setTag('MyTag', 'MyTagValue')
  span.log({ event: 'Event Information' })

  return myAdditionalApplicationLogic(result => {
    span.setTag('MyResult', result)
    span.finish()
  })

}
```

##### Scope Manager

In order to provide context propagation, this library includes a scope manager.
A scope is basically a wrapper around a span that can cross both synchronous and
asynchronous contexts.

The scope manager contains 3 APIs available on `tracer.scope()`:

###### scope.active()

This method returns the active span from the current scope.

###### scope.activate(span, fn)

This method activates the provided span in a new scope available in the
provided function. Any asynchronous context created from whithin that function
will also have the same scope.

```javascript
const tracer = require('signalfx-tracing').init()
const scope = tracer.scope()
const log = console.log

const requestSpan = tracer.startSpan('web.request')
const promise = Promise.resolve()

scope.activate(requestSpan, () => {
  log(scope.active()) // requestSpan because in new scope

  someFunction() // requestSpan because called in scope

  setTimeout(() => {
    log(scope.active()) // requestSpan because setTimeout called in scope
  })

  promise.then(() => {
    log(scope.active()) // requestSpan because then() called in scope
  })
})

function someFunction () {
  log(scope.active())
}

log(scope.active()) // null

someFunction() // null because called outside the scope
```

###### scope.bind(target, [span])

This method binds a target to the specified span, or to the active span if
unspecified. It supports binding functions, promises and event emitters.

When a span is provided, the target is always bound to that span. Explicitly
passing `null` as the span will actually bind to `null` or no span. When a span
is not provided, the binding uses the following rules:

* Functions are bound to the span that is active when `scope.bind(fn)` is called.
* Promise handlers are bound to the active span in the scope where `.then()` was
called. This also applies to any equivalent method such as `.catch()`.
* Event emitter listeners are bound to the active span in the scope where
`.addEventListener()` was called. This also applies to any equivalent method
such as `.on()`

**Note**: Native promises and promises from `bluebird`, `q` and `when` are
already bound by default and don't need to be explicitly bound.

##### Examples

###### Function binding

```javascript
const tracer = require('signalfx-tracing').init()
const scope = tracer.scope()
const log = console.log

const outerSpan = tracer.startSpan('web.request')

scope.activate(outerSpan, () => {
  const innerSpan = tracer.startSpan('web.middleware')

  const boundToInner = scope.bind(() => {
    log(scope.active())
  }, innerSpan)

  const boundToOuter = scope.bind(() => {
    log(scope.active())
  })

  boundToInner() // innerSpan because explicitly bound
  boundToOuter() // outerSpan because implicitly bound
})
```

###### Promise binding

```javascript
const tracer = require('signalfx-tracing').init()
const scope = tracer.scope()
const log = console.log

const outerSpan = tracer.startSpan('web.request')
const innerPromise = Promise.resolve()
const outerPromise = Promise.resolve()

scope.activate(outerSpan, () => {
  const innerSpan = tracer.startSpan('web.middleware')

  scope.bind(innerPromise, innerSpan)
  scope.bind(outerPromise)

  innerPromise.then(() => {
    log(scope.active()) // innerSpan because explicitly bound
  })

  outerPromise.then(() => {
    log(scope.active()) // outerSpan because implicitly bound on `then()` call
  })
})
```

**Note**: `async/await` cannot be bound and always execute in the scope where
`await` was called. If binding `async/await` is needed, the promise must be
wrapped by a function.

###### Event emitter binding

```javascript
const tracer = require('signalfx-tracing').init()
const scope = tracer.scope()
const log = console.log
const EventEmitter = require('events').EventEmitter

const outerSpan = tracer.startSpan('web.request')
const innerEmitter = new EventEmitter()
const outerEmitter = new EventEmitter()

scope.activate(outerSpan, async () => {
  const innerSpan = tracer.startSpan('web.middleware')

  scope.bind(innerEmitter, innerSpan)
  scope.bind(outerEmitter)

  innerEmitter.on('request', () => {
    log(scope.active()) // innerSpan because explicitly bound
  })

  outerEmitter.on('request', () => {
    log(scope.active()) // outerSpan because implicitly bound on `then()` call
  })
})

innerEmitter.emit('request')
outerEmitter.emit('request')
```

### Instrumentations

SignalFx-Tracing provides out-of-the-box instrumentations for many popular frameworks and libraries by using a plugin system. By default all built-in plugins are enabled. This behavior can be changed by setting the `plugins` option to `false` in the [tracer settings](#tracer-settings).

This method activates the provided span in a new scope available in the
provided function. Any asynchronous context created from whithin that function
will also have the same scope.

```javascript
const tracer = require('signalfx-tracing').init({ plugins: false })

// enable postgresql
tracer.use('pg')
// enable and configure express instrumentations
tracer.use('express', { headers: ['x-my-tagged-header'] })
```

Each integration also has its own list of default tags. These tags get automatically added to the span created by the integration.  Some have additional configuration settings to determine traced behavior.

#### amqplib

##### Tags

| Tag              | Description                                               |
|------------------|-----------------------------------------------------------|
| out.host         | The host of the AMQP server.                              |
| out.port         | The port of the AMQP server.                              |
| span.kind        | Set to either `producer` or `consumer` where it applies.  |
| amqp.queue       | The queue targeted by the command (when available).       |
| amqp.exchange    | The exchange targeted by the command (when available).    |
| amqp.routingKey  | The routing key targeted by the command (when available). |
| amqp.consumerTag | The consumer tag (when available).                        |
| amqp.source      | The source exchange of the binding (when available).      |
| amqp.destination | The destination exchange of the binding (when available). |

#### elasticsearch

##### Tags

| Tag                  | Description                                           |
|----------------------|-------------------------------------------------------|
| component            | Always set to `elasticsearch`.                        |
| db.type              | Always set to `elasticsearch`.                        |
| db.instance          | Always set to `elasticsearch`.                        |
| db.statement         | The body of the statement to elasticsearch.           |
| out.host             | The host of the Elasticsearch server.                 |
| out.port             | The port of the Elasticsearch server.                 |
| span.kind            | Always set to `client`.                               |
| elasticsearch.method | The underlying HTTP request verb.                     |
| elasticsearch.url    | The underlying HTTP request URL path.                 |
| elasticsearch.index  | The name of the index being queried                   |
| elasticsearch.params | The parameters of the query.                          |

#### express

##### Tags

| Tag              | Description                                               |
|------------------|-----------------------------------------------------------|
| http.url         | The complete URL of the request.                          |
| http.method      | The HTTP method of the request.                           |
| http.status_code | The HTTP status code of the response.                     |
| http.headers.*   | A recorded HTTP header.                                   |

##### Configuration Options

| Option                    | Default                   | Description                            |
|-------------------------|---------------------------|----------------------------------------|
| validateStatus          | `code => code < 500`      | Callback function to determine if there was an error. It should take a status code as its only parameter and return `true` for success or `false` for errors. |
| headers                 | `[]`                      | An array of headers to include in the span tags. |
| expandRouteParameters | `{}`                      | An object of the form `{ '/exact/path/:paramOne/:paramTwo': { 'paramOne': true } }` that will expand parameter values for operation names for each request to that path.  Be sure to only use for low-cardinality parameters.  Omitted parameters default to `false`. |

#### graphql

If no query operation name is explicitly provided, the `graphql` span operation name will be just `query`, `mutation` or `subscription`.

```graphql
# good, the span operation name will be `query HelloWorld`
query HelloWorld {
  hello
  world
}

# bad, the span operation name will be `query`
{
  hello
  world
}
```

##### Tags

| Tag                 | Description                                               |
|---------------------|-----------------------------------------------------------|
| graphql.document    | The original GraphQL document.                            |
| graphql.variables.* | The variables applied to the document.                    | 

##### Configuration Options

| Option          | Default                                          | Description                                                            |
|-----------------|--------------------------------------------------|------------------------------------------------------------------------|
| variables       | []                                               | An array of variable names to record. Can also be a callback that returns the key/value pairs to record. For example, using `variables => variables` would record all variables. |
| depth           | -1                                               | The maximum depth of fields/resolvers to instrument. Set to `0` to only instrument the operation or to -1 to instrument all fields/resolvers. |
| collapse        | true                                             | Whether to collapse list items into a single element. (i.e. single `users.*.name` span instead of `users.0.name`, `users.1.name`, etc) |

#### hapi

##### Tags

| Tag              | Description                                               |
|------------------|-----------------------------------------------------------|
| http.url         | The complete URL of the request.                          |
| http.method      | The HTTP method of the request.                           |
| http.status_code | The HTTP status code of the response.                     |
| http.headers.*   | A recorded HTTP header.                                   |

##### Configuration Options

| Option           | Default                   | Description                            |
|------------------|---------------------------|----------------------------------------|
| validateStatus   | `code => code < 500`      | Callback function to determine if there was an error. It should take a status code as its only parameter and return `true` for success or `false` for errors. |
| headers          | `[]`                      | An array of headers to include in the span tags. |

#### http / https

##### Tags

| Tag              | Description                                               |
|------------------|-----------------------------------------------------------|
| http.url         | The complete URL of the request.                          |
| http.method      | The HTTP method of the request.                           |
| http.status_code | The HTTP status code of the response.                     |

##### Configuration Options

| Option           | Default                               | Description       |
|------------------|---------------------------------------|-------------------|
| splitByDomain    | false                                 | Use the remote endpoint host as the service name instead of the default. |
| validateStatus   | `code => code < 400 || code >= 500`   | Callback function to determine if an HTTP response should be recorded as an error. It should take a status code as its only parameter and return `true` for success or `false` for errors.
| blacklist        | []                                    | List of URLs that should not be instrumented. Can be a string, RegExp, callback that takes the URL as a parameter, or an array of any of these.
| whitelist        | /.*/                                  | List of URLs that should be instrumented. If this is set, other URLs will not be instrumented. Can be a string, RegExp, callback that takes the URL as a parameter, or an array of any of these.

#### ioredis

##### Tags

| Tag          | Description                               |
|--------------|-------------------------------------------|
| component    | `mysql`                                   |
| db.type      | `mysql`                                   |
| db.instance  | The index of the queried database.        |
| db.statement | The statement used to query the database. |
| out.host     | The host of the Redis server.             |
| out.port     | The port of the Redis server.             |

#### koa

##### Tags

| Tag              | Description                                               |
|------------------|-----------------------------------------------------------|
| http.url         | The complete URL of the request.                          |
| http.method      | The HTTP method of the request.                           |
| http.status_code | The HTTP status code of the response.                     |
| http.headers.*   | A recorded HTTP header.                                   |

##### Configuration Options

| Option           | Default                   | Description                            |
|------------------|---------------------------|----------------------------------------|
| validateStatus   | `code => code < 500`      | Callback function to determine if there was an error. It should take a status code as its only parameter and return `true` for success or `false` for errors. |
| headers          | `[]`                      | An array of headers to include in the span tags. |

#### memcached

##### Tags

| Tag              | Description                                               |
|------------------|-----------------------------------------------------------|
| memcached.query  | The query sent to the server.                             |
| out.host         | The host of the Memcached server.                         |
| out.port         | The port of the Memcached server.                         |

#### mongodb-core

##### Tags

| Tag                  | Description                                           |
|----------------------|-------------------------------------------------------|
| db.name              | The qualified name of the queried collection.         |
| out.host             | The host of the MongoDB server.                       |
| out.port             | The port of the MongoDB server.                       |
| mongodb.cursor.index | When using a cursor, the current index of the cursor. |

#### mysql

##### Tags

| Tag              | Description                                                       |
|------------------|-------------------------------------------------------------------|
| component        | Always set to `mysql`.                                            |
| db.type          | The type of the queried database.                                 |
| db.user          | The user who made the query.                                      |
| db.instance      | The name of the queried database instance.                        |
| db.statement     | The database statement for the queried database.                  |
| out.host         | The host of the MySQL server.                                     |
| out.port         | The port of the MySQL serve                                       |

mysql2

##### Tags

| Tag              | Description                                                         |
|------------------|---------------------------------------------------------------------|
| component        | Always set to `mysql2`.                                             |
| db.type          | The type of the queried database.                                   |
| db.user          | The user who made the query.                                        |
| db.instance      | The name of the queried database instance.                          |
| db.statement     | The database statement for the queried database.                    |
| out.host         | The host of the MySQL server.                                       |
| out.port         | The port of the MySQL server.                                       |

#### pg

##### Tags

| Tag              | Description                                                          |
|------------------|----------------------------------------------------------------------|
| component        | Always set to `postgres`.                                            |
| db.type          | The type of the queried database.                                    |
| db.user          | The user who made the query.                                         |
| db.instance      | The name of the queried database.                                    |
| db.statement     | The database statement for the queried database.                     |
| out.host         | The host of the PostgreSQL server.                                   |
| out.port         | The port of the PostgreSQL server.                                   |

#### redis

##### Tags

| Tag          | Description                               |
|--------------|-------------------------------------------|
| component    | `mysql`                                   |
| db.type      | `mysql`                                   |
| db.instance  | The index of the queried database.        |
| db.statement | The statement used to query the database. |
| out.host     | The host of the Redis server.             |
| out.port     | The port of the Redis server.             |

#### restify

##### Tags

| Tag              | Description                                               |
|------------------|-----------------------------------------------------------|
| http.url         | The complete URL of the request.                          |
| http.method      | The HTTP method of the request.                           |
| http.status_code | The HTTP status code of the response.                     |
| http.headers.*   | A recorded HTTP header.                                   |

##### Configuration Options

| Option           | Default                   | Description                            |
|------------------|---------------------------|----------------------------------------|
| validateStatus   | `code => code < 500`      | Callback function to determine if there was an error. It should take a status code as its only parameter and return `true` for success or `false` for errors. |
| headers          | `[]`                      | An array of headers to include in the span tags. |

#### Sails

This instrumentation only adds traces for Sails actions registered by your app.
The router and request handling is done by Express instrumentation.

#### Socket.IO

| Tag           | Description                          |
| ------------- | ----------------                     |
| component     | `socket.io`                          |
| namespace     | Namespace of the event. Default: `/` |
| path          | Path for the socket                  |
| clients.count | Number of current clients            |
| events.count  | Number of registered events          |

##### Configuration Options

| Option       | Default | Description                                                                          |
|--------------|---------|--------------------------------------------------------------------------------------|
| omitReserved | `false` | If `true`, skip tracing for reserved events: https://socket.io/docs/emit-cheatsheet/ |
| omitEvents   | `[]`    | A list of events that should not be traced                                           |

### Advanced Configuration

#### Tracer settings

Options can be configured as a parameter to the `init()` method or as environment variables.

| Config        | Environment Variable         | Default   | Description |
| ------------- | ---------------------------- | --------- | ----------- |
| service       | SIGNALFX_SERVICE_NAME        | unnamed-node-service | The service name to be used for this program. |
| url           | SIGNALFX_ENDPOINT_URL          | http://localhost:9080/v1/trace | The url of the Agent or Gateway to which the tracer will submit traces.
| accessToken   | SIGNALFX_ACCESS_TOKEN        |           | The optional organization access token for trace submission requests
| enabled       | SIGNALFX_TRACING_ENABLED     | true      | Whether to enable the tracer. |
| debug         | SIGNALFX_TRACING_DEBUG       | false     | Enable debug logging in the tracer. |
| logInjection  | SIGNALFX_LOGS_INJECTION      | false     | Enable automatic injection of trace IDs in logs for supported logging libraries.
| tags          |                              | {}        | Set global tags that should be applied to all spans. |
| sampleRate    |                              | 1         | Percentage of spans to sample as a float between 0 and 1. |
| flushInterval |                              | 2000      | Interval in milliseconds at which the tracer will submit traces to the agent. |
| experimental  |                              | {}        | Experimental features can be enabled all at once using boolean `true` or individually using key/value pairs. There are currently no experimental features available. |
| plugins       |                              | true      | Whether or not to enable automatic instrumentation of external libraries using the built-in plugins. |

#### Custom Logging

By default, logging from this library is disabled. In order to get debbuging information and errors sent to logs, the `debug` options should be set to `true` in the `init()` method.

The tracer will then log debug information to `console.log()` and errors to `console.error()`. This behavior can be changed by passing a custom logger to the tracer. The logger should contain a `debug()` and `error()` methods that can handle messages and errors, respectively.

For example:

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
