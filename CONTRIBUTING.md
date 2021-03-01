# Contributing to signalfx-tracing

Please reach out via a [GitHub issue](https://github.com/signalfx/signalfx-nodejs-tracing/issues)
before developing anything requiring a major code change.

If you are not a Splunk employee and would like to contribute code to this project, please read and fill out the
[Splunk CLA](https://www.splunk.com/en_us/form/contributions.html).

# Running Unit and Integration Tests

```bash
  $ # Start the required databases
  $ docker-compose up -d -V --remove-orphans --force-recreate
  $ # Run the tests
  $ yarn test
  $ yarn lint
```

Running the tests within a `node:8` container in host network mode is highly recommended.
This ensures a more repeatable environment while being able to reach the data stores running on the host machine.
