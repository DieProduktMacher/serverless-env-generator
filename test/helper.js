/* global describe it beforeEach afterEach */
const chai = require('chai')
const chaiAsPromised = require('chai-as-promised')
const sinon = require('sinon')
const fs = require('fs-extra')
const yaml = require('js-yaml')
const helper = require('../src/helper')
const kms = require('../src/kms')

chai.use(chaiAsPromised)
const expect = chai.expect

const baseConfig = {
  region: 'eu-central-1',
  yamlPaths: ['./some/path.yml', './some/otherPath.yml'],
  kmsKeyId: 'mysecretkey'
}

const files = {
  './some/path.yml': `
      dev:
        foo: bar
        sec: encrypted:$€1
        lala: blabla
      prod:
        foo: baz
        sec: encrypted:€1$
  `,
  './some/otherPath.yml': `
      dev:
        foo: barazza
  `
}

describe('helper.js', () => {
  var sandbox

  beforeEach(() => {
    sandbox = sinon.sandbox.create()
    sandbox.stub(fs, 'readFile').callsFake(path => {
      if (path in files) {
        return Promise.resolve(files[path])
      } else if (path === 'file/with/read/error.yml') {
        return Promise.reject(new Error('Some random read error'))
      } else {
        const error = new Error('File not found')
        error.code = 'ENOENT'
        return Promise.reject(error)
      }
    })
    sandbox.stub(kms, 'decrypt').callsFake((text, config) => {
      expect(config.kmsKeyId).to.equal('mysecretkey')
      return Promise.resolve(text.replace('€', 'E').replace('$', 'S').replace('1', 'I'))
    })
    sandbox.stub(kms, 'encrypt').callsFake((text, config) => {
      expect(config.kmsKeyId).to.equal('mysecretkey')
      return Promise.resolve(text.replace('E', '€').replace('S', '$').replace('I', '1'))
    })
  })

  afterEach((done) => {
    sandbox.restore()
    done()
  })

  it('should list no files if no YAML files are specified', () => {
    let config = Object.assign({}, baseConfig, {
      stage: 'dev',
      yamlPaths: []
    })
    return helper.getEnvVars(null, false, config).then(result => {
      expect(result).lengthOf(0)
    })
  })

  it('should list correct files & variables for stage "dev"', () => {
    let config = Object.assign({}, baseConfig, {
      stage: 'dev'
    })
    return helper.getEnvVars(null, false, config).then(result => {
      expect(result).lengthOf(2)
      expect(result[0].file).equal('path.yml')
      expect(result[0].filePath).equal('./some/path.yml')
      expect(result[0].vars).is.eql([
        { attribute: 'foo', value: 'bar', encrypted: false },
        { attribute: 'sec', value: '$€1', encrypted: true },
        { attribute: 'lala', value: 'blabla', encrypted: false }
      ])
      expect(result[1].file).equal('otherPath.yml')
      expect(result[1].filePath).equal('./some/otherPath.yml')
      expect(result[1].vars).eql([
        { attribute: 'foo', value: 'barazza', encrypted: false }
      ])
    })
  })

  it('should list only variable "foo" for stage "dev"', () => {
    let config = Object.assign({}, baseConfig, {
      stage: 'dev'
    })
    return helper.getEnvVars('foo', false, config).then(result => {
      expect(result).lengthOf(2)
      expect(result[0].vars).is.eql([
        { attribute: 'foo', value: 'bar', encrypted: false }
      ])
      expect(result[1].vars).eql([
        { attribute: 'foo', value: 'barazza', encrypted: false }
      ])
    })
  })

  it('should list decrypted variables for stage "prod"', () => {
    let config = Object.assign({}, baseConfig, {
      stage: 'prod'
    })
    return helper.getEnvVars(null, true, config).then(result => {
      expect(result).lengthOf(2)
      expect(result[0].vars).is.eql([
        { attribute: 'foo', value: 'baz', encrypted: false },
        { attribute: 'sec', value: 'EIS', encrypted: true }
      ])
      expect(result[1].vars).eql([])
    })
  })

  it('should list no variables for non-existing stage', () => {
    let config = Object.assign({}, baseConfig, {
      stage: 'imaginary'
    })
    return helper.getEnvVars(null, false, config).then(result => {
      expect(result).lengthOf(2)
      expect(result[0].vars).lengthOf(0)
      expect(result[1].vars).lengthOf(0)
    })
  })

  it('should overwrite variable "foo" for stage "dev"', () => {
    let config = Object.assign({}, baseConfig, {
      stage: 'dev'
    })
    sandbox.stub(fs, 'writeFile').callsFake((file, content) => {
      let doc = yaml.safeLoad(content)
      expect(file).to.equal('./some/path.yml')
      expect(doc.dev.foo).to.equal('bar2')
      expect(doc.prod.foo).to.equal('baz')
    })
    return helper.setEnvVar('foo', 'bar2', false, config)
  })

  it('should write variable "newFoo" for stage "prod"', () => {
    let config = Object.assign({}, baseConfig, {
      stage: 'prod'
    })
    sandbox.stub(fs, 'writeFile').callsFake((file, content) => {
      let doc = yaml.safeLoad(content)
      expect(file).to.equal('./some/path.yml')
      expect(doc.dev.newFoo).to.equal(undefined)
      expect(doc.prod.newFoo).to.equal('bar')
    })
    return helper.setEnvVar('newFoo', 'bar', false, config)
  })

  it('should overwrite & encrypt variable "foo" for stage "prod"', () => {
    let config = Object.assign({}, baseConfig, {
      stage: 'prod'
    })
    sandbox.stub(fs, 'writeFile').callsFake((file, content) => {
      let doc = yaml.safeLoad(content)
      expect(file).to.equal('./some/path.yml')
      expect(doc.dev.foo).to.equal('bar')
      expect(doc.prod.foo).to.equal('encrypted:€$1')
    })
    return helper.setEnvVar('foo', 'ESI', true, config)
  })

  it('should overwrite decrypted variable "sec" with non-encrypted value for stage "dev"', () => {
    let config = Object.assign({}, baseConfig, {
      stage: 'dev'
    })
    sandbox.stub(fs, 'writeFile').callsFake((file, content) => {
      let doc = yaml.safeLoad(content)
      expect(file).to.equal('./some/path.yml')
      expect(doc.dev.sec).to.equal('secretNoMore')
      expect(doc.prod.sec).to.equal('encrypted:€1$')
    })
    return helper.setEnvVar('sec', 'secretNoMore', false, config)
  })

  it('should overwrite decrypted variable "sec" for stage "prod"', () => {
    let config = Object.assign({}, baseConfig, {
      stage: 'prod'
    })
    sandbox.stub(fs, 'writeFile').callsFake((file, content) => {
      let doc = yaml.safeLoad(content)
      expect(file).to.equal('./some/path.yml')
      expect(doc.dev.sec).to.equal('encrypted:$€1')
      expect(doc.prod.sec).to.equal('encrypted:1$€')
    })
    return helper.setEnvVar('sec', 'ISE', true, config)
  })

  it('should write variable "foo" to new stage "newbie"', () => {
    let config = Object.assign({}, baseConfig, {
      stage: 'newbie'
    })
    sandbox.stub(fs, 'writeFile').callsFake((file, content) => {
      let doc = yaml.safeLoad(content)
      expect(file).to.equal('./some/path.yml')
      expect(doc.dev.foo).to.equal('bar')
      expect(doc.prod.foo).to.equal('baz')
      expect(doc.newbie.foo).to.equal('bai')
    })
    return helper.setEnvVar('foo', 'bai', false, config)
  })

  it('should not write if no YAML paths are specified', () => {
    let config = Object.assign({}, baseConfig, {
      stage: 'dev',
      yamlPaths: []
    })
    return expect(helper.setEnvVar('foo', 'bai', false, config)).to.be.rejected
  })

  it('should create new file if YAML file does not exist', () => {
    let config = Object.assign({}, baseConfig, {
      stage: 'dev',
      yamlPaths: [ './some/non/existing/path.yml' ]
    })
    sandbox.stub(fs, 'writeFile').callsFake((file, content) => {
      let doc = yaml.safeLoad(content)
      expect(file).to.equal('./some/non/existing/path.yml')
      expect(doc.dev.foo).to.equal('bar')
    })
    return helper.setEnvVar('foo', 'bar', false, config)
  })

  it('should not create new file if there was a file reading error', () => {
    let config = Object.assign({}, baseConfig, {
      stage: 'dev',
      yamlPaths: [ './file/with/read/error.yml' ]
    })
    return expect(helper.setEnvVar('foo', 'bar', false, config)).to.be.rejected
  })
})
