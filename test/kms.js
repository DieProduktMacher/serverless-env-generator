/* global describe it beforeEach afterEach */
const aws = require('aws-sdk')
const chai = require('chai')
const chaiAsPromised = require('chai-as-promised')
const sinon = require('sinon')
const kms = require('../src/kms')

chai.use(chaiAsPromised)
const expect = chai.expect

describe('kms.js', () => {
  var sandbox

  beforeEach(() => {
    sandbox = sinon.sandbox.create()
  })

  afterEach((done) => {
    sandbox.restore()
    done()
  })

  it('should encrypt keys', () => {
    let config = {
      region: 'eu-central-1',
      stage: 'dev',
      profile: 'myprovile',
      kmsKeyId: 'key1'
    }
    sandbox.stub(aws, 'KMS').callsFake(_ => {
      return {
        encrypt: (params, callback) => {
          expect(params.Plaintext).to.equal('EIS')
          callback(null, { CiphertextBlob: '€1$' })
        }
      }
    })
    return kms.encrypt('EIS', config).then(result => {
      expect(result).eql('€1$')
    })
  })

  it('should decrypt keys', () => {
    let config = {
      region: 'eu-central-1',
      stage: 'dev',
      profile: 'myprovile',
      kmsKeyId: 'key2'
    }
    sandbox.stub(aws, 'KMS').callsFake(_ => {
      return {
        decrypt: (params, callback) => {
          expect(!!params.CiphertextBlob).to.equal(true)
          callback(null, { Plaintext: { toString: () => 'EIS' } })
        }
      }
    })
    return kms.decrypt('€1$', config).then(result => {
      expect(result).eql('EIS')
    })
  })

  it('should handle KMS encryption error', () => {
    let config = {
      region: 'eu-central-1',
      stage: 'dev',
      profile: 'myprovile',
      kmsKeyId: 'key3'
    }
    sandbox.stub(aws, 'KMS').callsFake(_ => {
      return {
        encrypt: (params, callback) => callback(new Error('Some error'), null)
      }
    })
    return expect(kms.encrypt('EIS', config)).to.be.rejected
  })

  it('should handle KMS decryption error', () => {
    let config = {
      region: 'eu-central-1',
      stage: 'dev',
      profile: 'myprovile',
      kmsKeyId: 'key4'
    }
    sandbox.stub(aws, 'KMS').callsFake(_ => {
      return {
        decrypt: (params, callback) => callback(new Error('Some error'), null)
      }
    })
    return expect(kms.decrypt('€1$', config)).to.be.rejected
  })
})
