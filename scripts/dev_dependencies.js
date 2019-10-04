const exec = require('./helpers/exec')

function installNock () {
  // Required version of nock for 12+ doesn't support node <8.
  // Manually install last supported version until 4 and 6 support are dropped
  if (process.versions.node.split('.')[0] < 8) {
    exec('yarn remove --force --ignore-engines nock')
    exec('yarn add --dev -E --ignore-engines nock@9.6.1')
  }
}

installNock()
