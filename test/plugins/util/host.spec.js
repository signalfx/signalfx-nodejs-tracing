'use strict'

const isHostName = require('../../../src/plugins/util/host').isHostName

describe('plugins/utils/host', () => {
  describe('isHostName', () => {
    it('should return true for valid host names', () => {
      const hosts = [
        'example.com',
        'localhost',
        'en.wikipedia.org',
        '1.a.com',
        '0-1.test',
        '0-a.c.y',
        'xn--hxa'
      ]

      hosts.forEach((name) => expect(isHostName(name)).to.be.true)
    })

    it('should return false for ipv4', () => {
      const hosts = [
        '0.0.0.0',
        '01.02.03.04',
        '127.0.0.1',
        '127.000.000.001',
        '192.168.1.2',
        '255.255.255.255'
      ]

      hosts.forEach((name) => expect(isHostName(name)).to.be.false)
    })

    it('should return false for ipv6', () => {
      const hosts = [
        '::',
        '::1',
        '1::',
        'ff0X::1',
        'ff02::1',
        '::1234:5678',
        '2001:0db7:0002:0000:0000:0ab9:C0A9:0103'
      ]

      hosts.forEach((name) => expect(isHostName(name)).to.be.false)
    })

    it('should return false for jank', () => {
      const hosts = [
        null,
        undefined,
        NaN,
        true,
        1234,
        {},
        [],
        '',
        ' '
      ]

      hosts.forEach((name) => expect(isHostName(name)).to.be.false)
    })
  })
})
