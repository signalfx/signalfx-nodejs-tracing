'use strict'

function idToHex (id) {
  const padded = '0000000000000000' + id.toString(16)
  return padded.slice(-16)
}

function microTs (ts) {
  return Math.round(ts * 1000)
}

module.exports = { idToHex, microTs }
