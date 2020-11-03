# SignalFx Tracing Library for JavaScript

[![npm (tag)](https://img.shields.io/npm/v/signalfx-tracing.svg)](https://www.npmjs.com/package/signalfx-tracing)
[![CircleCI](https://circleci.com/gh/signalfx/signalfx-nodejs-tracing.svg?style=shield)](https://circleci.com/gh/signalfx/signalfx-nodejs-tracing)

The SignalFx Tracing Library for JavaScript automatically instruments your
Node.js application to capture and report distributed traces to SignalFx
with an OpenTracing-compatible tracer.

The tracer has constant sampling (i.e., 100% chance of tracing) and
reports every span. Where applicable, context propagation uses
[B3 headers](https://github.com/openzipkin/b3-propagation).

For more information about configuring and using the agent, see the
[examples](https://github.com/signalfx/tracing-examples/tree/master/signalfx-tracing/signalfx-nodejs-tracing).

For advanced configuration information, see
[SignalFx Tracing Library for JavaScript - API](./docs/API.md).

## Requirements and supported software

The library supports Node.js versions 4.7+, 6.9+, and 8+.

These are the supported libraries. Instrumentation for each library is in beta.

| Library | Versions supported | Instrumentation name(s) | Notes |
| ---     | ---                | ---                     | ---   |
| [adonis](https://github.com/adonisjs) | 4+ | `use('adonis')` | |
| [amqp10](https://github.com/noodlefrenzy/node-amqp10) | 3+ | `use('amqp10')` | |
| [amqplib](http://www.squaremobius.net/amqp.node/) | 0.5+ | `use('amqplib')` | |
| [Bluebird](https://github.com/petkaantonov/bluebird) | 2+ | `use('bluebird')` | |
| [Bunyan](https://github.com/trentm/node-bunyan) | 1+ | `use('bunyan')`| |
| [cassandra-driver](https://github.com/datastax/nodejs-driver) | 3+ | `use('cassandra-driver')` | |
| [DNS](https://nodejs.org/api/dns.html) | Supported Node | `use('dns')` | |
| [elasticsearch](https://www.elastic.co/guide/en/elasticsearch/client/javascript-api/current/index.html) | 10+ | `use('elasticsearch')` | |
| [Express](http://expressjs.com/) | 4+ | `use('express')` | |
| [fastify](https://fastify.io/) | 1+ | `use('fastify')` | |
| [GraphQL](https://github.com/graphql/graphql-js) | 0.10+ | `use('graphql')` | |
| [hapi](https://hapijs.com/) | 2+ | `use('hapi')` | |
| [http/https](https://nodejs.org/api/http.html) | Supported Node | `use('http')`, `use('https')` | |
| [ioredis](https://github.com/luin/ioredis)| 2+ | `use('ioredis')` | |
| [Koa](https://koajs.com/) | 2+ | `use('koa')` | |
| [Knex](https://knexjs.org/) | 0.10+ | `use('bluebird'); use('knex')` | Depends on bluebird instrumentation |
| [Memcached](https://github.com/3rd-Eden/memcached) | 2.2+ | `use('memcached')` | |
| [MongoDB-Core](https://github.com/mongodb-js/mongodb-core) | 2+ | `use('mongodb-core')` | |
| [mysql](https://github.com/mysqljs/mysql) | 2+ | `use('mysql')` | |
| [MySQL2](https://github.com/sidorares/node-mysql2) | 1+ | `use('mysql2')` | |
| [Nest](https://nestjs.com/) | 4.x - 6.x | `use('nest')` | |
| [Net](https://nodejs.org/api/net.html) | Supported Node | `use('net')` | |
| [node-postgres](https://github.com/brianc/node-postgres) | 4+ | `use('pg')` | |
| [Pino](http://getpino.io/#/) | 2+ | `use('pino')` | |
| [Q](https://github.com/kriskowal/q) | 1+ | `use('q')` | |
| [Redis](https://github.com/NodeRedis/node_redis) | 0.12+ | `use('redis')` | |
| [restify](http://restify.com/) | 3+ | `use('restify')` | |
| [Sails](https://sailsjs.com) | 1+ | `use('sails')` | |
| [Socket.IO](https://socket.io) | 1.2+ | `use('socket.io')` | |
| [when.js](https://github.com/cujojs/when) | 3+ | `use('when')` | |
| [winston](https://github.com/winstonjs/winston) | 1+ | `use('winston')` | |

## Configure the SignalFx Tracing Library for JavaScript

Send traces from your Java application to a local or remote Smart Agent,
OpenTelemetry Collector, or SignalFx ingest endpoint.

### Configuration values

Configure these options as parameters for the `init()` method or as environment variables.

| Config                  | Environment Variable                | Default   | Description |
| ----------------------- | ----------------------------------- | --------- | ----------- |
| service                 | SIGNALFX_SERVICE_NAME               | unnamed-nodejs-service | The service name to be used for this program. |
| url                     | SIGNALFX_ENDPOINT_URL               | http://localhost:9080/v1/trace | The url of the Agent or Gateway to which the tracer will submit traces. |
| accessToken             | SIGNALFX_ACCESS_TOKEN               |           | The optional organization access token for trace submission requests |
| enabled                 | SIGNALFX_TRACING_ENABLED            | true      | Whether to enable the tracer. |
| debug                   | SIGNALFX_TRACING_DEBUG              | false     | Enable debug logging in the tracer. |
| logInjection            | SIGNALFX_LOGS_INJECTION             | false     | Enable automatic injection of trace IDs in logs for supported logging libraries. |
| tags                    | SIGNALFX_SPAN_TAGS                  | {}        | Set global tags that should be applied to all spans. Format for the environment variable is `key1:val1,key2:val2`. |
| flushInterval           |                                     | 2000      | Interval in milliseconds at which the tracer will submit traces to the agent. |
| plugins                 |                                     | true      | Whether or not to enable automatic instrumentation of external libraries using the built-in plugins. |
| recordedValueMaxLength  | SIGNALFX_RECORDED_VALUE_MAX_LENGTH  | 1200      | Maximum length an attribute value can have. Values longer than this limit are truncated. Any negative value turns off truncation. |

### Steps

To set up the library, install it and add the OpenTracing-compatible tracer
to your application.

1. Install the [latest release](https://github.com/signalfx/signalfx-nodejs-tracing/releases/latest) of the tracing library. You can install directly from npm or directly
from the  GitHub repository.

      npm:
      ```bash
        $ npm install signalfx-tracing
      ```
      GitHub:
      ```bash
        $ git clone https://github.com/signalfx/signalfx-nodejs-tracing.git
        $ npm install ./signalfx-nodejs-tracing
      ```
2. Set the service name for your application if not set via tracer configuration code:
      ```bash
        $ SIGNALFX_SERVICE_NAME=your_app_name node your_app.js
3. Configure the OpenTracing-compatible tracer to report traces to a Smart
Agent or OpenTelemetry Collector. You have to include this before you import
the target library.

      ```javascript
      // init() invocation must occur before importing any traced library (e.g. Express)
      const tracer = require('signalfx-tracing').init({
        // Service name, also configurable via
        // SIGNALFX_SERVICE_NAME environment variable
        service: 'my-traced-service',
        // Smart Agent or Gateway endpoint, also configurable via
        // SIGNALFX_ENDPOINT_URL environment variable
        url: 'http://my_agent_or_gateway:9080/v1/trace', // http://localhost:9080/v1/trace by default
        // Optional organization access token, also configurable via
        // SIGNALFX_ACCESS_TOKEN environment variable
        accessToken: 'myOptionalOrganizationAccessToken',
        // Optional environment tag
        tags: {environment: 'myEnvironment'}
      })

      // auto-instrumented example Express application
      const express = require('express')
      const app = express()
      ```

## Inject trace IDs in logs

Link individual log entries with trace IDs and span IDs associated with
corresponding events. Inject trace context in logs with these loggers:

* Bunyan
* Pino
* Winston

You can also enable trace ID log injection with a custom logger.

When you configure trace ID log injection, your logger receives this info for
the `span.context`:

```json
signalfx: {
  trace_id: <trace_id>,
  span_id: <span_id>      
}
```

### Inject trace IDs with Bunyan, Pino, or Winston

To transfer trace context to logs with Bunyan, Pino, or Winston, enable trace
ID log injection with this environment variable:

```bash
$ SIGNALFX_LOGS_INJECTION=true
```

### Inject trace IDs with a custom logger

To transfer trace context with a custom logger, add `tracer.inject` to your
custom logger class like this:

```javascript
const tracer = require('signalfx-tracing').init()
const formats = require('signalfx-tracing/ext/formats');

class Logger {
    log(level, message) {
        const span = tracer.scope().active();
        const time = new Date().toISOString();
        const record = { time, level, message };

        if (span) {
            tracer.inject(span.context(), formats.LOG, yourRecordObject);
        }

        console.log(JSON.stringify(yourRecordObject));
    }
}

module.exports = Logger;
```

where `yourRecordObject` is the object you want to inject `span.context` in.

## License and versioning

The SignalFx Tracing Library for JavaScript is released under the terms of the BSD 3-Clause License. See the [the license file](./LICENSE) for more details.

The SignalFx-Tracing Library for JavaScript is a fork of the DataDog APM
JavaScript Tracer that has been modified to provide Zipkin v2 JSON formatting,
B3 trace propagation functionality, and properly annotated trace data for
handling by [SignalFx Microservices APM](https://docs.signalfx.com/en/latest/apm2/apm2-overview/apm2-overview.html).
