/* global describe it beforeEach afterEach */
const chai = require('chai')
const sinon = require('sinon')
const fs = require('fs-extra')
const Serverless = require('serverless/lib/Serverless')
const AwsProvider = require('serverless/lib/plugins/aws/provider/awsProvider')
const EnvGenerator = require('../src')
const helper = require('../src/helper')
const chaiAsPromised = require('chai-as-promised');
const expect = chai.expect
chai.use(chaiAsPromised)

const defaultEnvFiles = [{
    file: 'path.yml',
    filePath: 'some/path.yml',
    vars: [{
      attribute: 'foo',
      value: 'foo',
      encrypted: false
    },
    {
      attribute: 'bar',
      value: 'bar',
      encrypted: false
    },
    {
      attribute: 'baz',
      value: 'baz',
      encrypted: false
    },
    {
      attribute: 'sec',
      value: '$€1',
      encrypted: true
    }]
  },
  {
    file: 'otherPath.yml',
    filePath: 'some/otherPath.yml',
    vars: [{
      attribute: 'bar',
      value: 'baar',
      encrypted: false
    },
    {
      attribute: 'baz',
      value: 'baaz',
      encrypted: false
    }]
  }
]

describe('index.js', () => {
  var sandbox, serverless, envGenerator

  const initEnvGenerator = (options) => {
    envGenerator = new EnvGenerator(serverless, options)
  }

  beforeEach(() => {
    sandbox = sinon.sandbox.create()

    serverless = new Serverless()
    serverless.service.provider.stage = 'dev'
    serverless.service.provider.profile = 'myproject-dev'
    serverless.service.provider.region = 'eu-central-1'
    serverless.service.provider.environment = {}
    serverless.service.custom.envFiles = ['some/path.yml', 'some/otherPath.yml']
    serverless.service.custom.envEncryptionKeyId = {
      dev: 'somedevkey',
      prod: 'someprodkey'
    }
    serverless.init()
    serverless.setProvider('aws', new AwsProvider(serverless))
  })

  afterEach((done) => {
    sandbox.restore()
    done()
  })

  it('should have hooks', () => {
    initEnvGenerator()
    expect(Object.keys(envGenerator.hooks).length).to.not.equal(0)
  })

  it('should list environment variables', () => {
    initEnvGenerator()
    sandbox.stub(helper, 'getEnvVars').callsFake((attribute, decrypt, config) => {
      expect(attribute).to.eql(undefined)
      expect(decrypt).to.equal(false)
      expect(config.region).to.equal('eu-central-1')
      expect(config.stage).to.equal('dev')
      expect(config.profile).to.equal('myproject-dev')
      expect(config.yamlPaths).to.eql(['some/path.yml', 'some/otherPath.yml'])
      expect(config.kmsKeyId).to.equal('somedevkey')
      return Promise.resolve(defaultEnvFiles)
    })
    sandbox.stub(serverless.cli, 'log')
      .onCall(0).callsFake(_ => expect(_).to.equal('path.yml:'))
      .onCall(1).callsFake(_ => expect(_).to.equal('  foo: foo'))
      .onCall(2).callsFake(_ => expect(_).to.equal('  bar: bar'))
      .onCall(3).callsFake(_ => expect(_).to.equal('  baz: baz'))
      .onCall(4).callsFake(_ => expect(_).to.equal('  sec: ******'))
      .onCall(5).callsFake(_ => expect(_).to.equal('otherPath.yml:'))
      .onCall(6).callsFake(_ => expect(_).to.equal('  bar: baar'))
      .onCall(7).callsFake(_ => expect(_).to.equal('  baz: baaz'))
    return envGenerator.hooks['env:env']().then(_ => {
      expect(helper.getEnvVars.callCount).to.equal(1)
    })
  })

  it('should list environment variables for attribute "foo", stage "prod" and region "eu-central-2"', () => {
    serverless.service.custom.envFiles = ['some/newPath.yml']
    serverless.processedInput.options.stage = 'prod'
    serverless.processedInput.options.profile = 'myproject-prod'
    serverless.processedInput.options.region = 'eu-central-2'
    initEnvGenerator({
      attribute: 'foo'
    })
    sandbox.stub(helper, 'getEnvVars').callsFake((attribute, decrypt, config) => {
      expect(attribute).to.equal('foo')
      expect(decrypt).to.equal(false)
      expect(config.region).to.equal('eu-central-2')
      expect(config.stage).to.equal('prod')
      expect(config.profile).to.equal('myproject-prod')
      expect(config.kmsKeyId).to.equal('someprodkey')
      return Promise.resolve(defaultEnvFiles)
    })
    sandbox.stub(serverless.cli, 'log')
      .onCall(0).callsFake(_ => expect(_).to.equal('path.yml:'))
      .onCall(1).callsFake(_ => expect(_).to.equal('  foo: foo'))

    return envGenerator.hooks['env:env']().then(_ => {
      expect(helper.getEnvVars.callCount).to.equal(1)
    })
  })

  it('should list decrypted environment variables', () => {
    initEnvGenerator({
      decrypt: true
    })
    sandbox.stub(helper, 'getEnvVars').callsFake((attribute, decrypt, config) => {
      expect(attribute).to.eql(undefined)
      expect(decrypt).to.equal(true)
      expect(config.region).to.equal('eu-central-1')
      expect(config.stage).to.equal('dev')
      expect(config.yamlPaths).to.eql(['some/path.yml', 'some/otherPath.yml'])
      expect(config.kmsKeyId).to.equal('somedevkey')
      return Promise.resolve(defaultEnvFiles)
    })
    sandbox.stub(serverless.cli, 'log')
      .onCall(0).callsFake(_ => expect(_).to.equal('path.yml:'))
      .onCall(1).callsFake(_ => expect(_).to.equal('  foo: foo'))
      .onCall(2).callsFake(_ => expect(_).to.equal('  bar: bar'))
      .onCall(3).callsFake(_ => expect(_).to.equal('  baz: baz'))
      .onCall(4).callsFake(_ => expect(_).to.equal('  sec: $€1 (encrypted)'))
      .onCall(5).callsFake(_ => expect(_).to.equal('otherPath.yml:'))
      .onCall(6).callsFake(_ => expect(_).to.equal('  bar: baar'))
      .onCall(7).callsFake(_ => expect(_).to.equal('  baz: baaz'))
    return envGenerator.hooks['env:env']().then(_ => {
      expect(helper.getEnvVars.callCount).to.equal(1)
    })
  })

  it('should write an environment variable', () => {
    initEnvGenerator({
      attribute: 'foo',
      value: 'baa',
      encrypt: false
    })
    sandbox.stub(helper, 'setEnvVar').callsFake((attribute, value, encrypted, config) => {
      expect(attribute).to.equal('foo')
      expect(value).to.equal('baa')
      expect(encrypted).to.equal(false)
      expect(config.region).to.equal('eu-central-1')
      expect(config.stage).to.equal('dev')
      expect(config.profile).to.equal('myproject-dev')
      expect(config.yamlPaths).to.eql(['some/path.yml', 'some/otherPath.yml'])
      expect(config.kmsKeyId).to.equal('somedevkey')
      return Promise.resolve(true)
    })
    sandbox.stub(serverless.cli, 'log')
      .onCall(0).callsFake(_ => expect(_).to.equal('Successfuly set foo 🎉'))
    return envGenerator.hooks['env:env']().then(_ => {
      expect(helper.setEnvVar.callCount).to.equal(1)
    })
  })

  it('should write an encrypted environment variable', () => {
    initEnvGenerator({
      attribute: 'foo',
      value: 'baa',
      encrypt: true
    })
    sandbox.stub(helper, 'setEnvVar').callsFake((attribute, value, encrypt, config) => {
      expect(attribute).to.equal('foo')
      expect(value).to.equal('baa')
      expect(encrypt).to.equal(true)
      expect(config.region).to.equal('eu-central-1')
      expect(config.stage).to.equal('dev')
      expect(config.profile).to.equal('myproject-dev')
      expect(config.yamlPaths).to.eql(['some/path.yml', 'some/otherPath.yml'])
      expect(config.kmsKeyId).to.equal('somedevkey')
      return Promise.resolve(true)
    })
    sandbox.stub(serverless.cli, 'log')
      .onCall(0).callsFake(_ => expect(_).to.equal('Successfuly set foo 🎉'))
    return envGenerator.hooks['env:env']().then(_ => {
      expect(helper.setEnvVar.callCount).to.equal(1)
    })
  })

  it('should not write a variable if no attribute option is set', () => {
    initEnvGenerator({
      value: 'lalala',
      encrypt: true
    })
    return expect(envGenerator.hooks['env:env']()).to.be.eventually.rejected;
  })

  it('should write and delete .env file on deployment', () => {
    initEnvGenerator({})
    sandbox.stub(helper, 'getEnvVars').callsFake((attribute, decrypt, config) => {
      expect(attribute).to.eql(undefined)
      expect(decrypt).to.equal(true)
      expect(config.region).to.equal('eu-central-1')
      expect(config.stage).to.equal('dev')
      expect(config.profile).to.equal('myproject-dev')
      expect(config.yamlPaths).to.eql(['some/path.yml', 'some/otherPath.yml'])
      expect(config.kmsKeyId).to.equal('somedevkey')
      return Promise.resolve(defaultEnvFiles)
    })
    sandbox.stub(fs, 'writeFile').callsFake((file, content) => {
      expect(file).to.equal('.env')
      expect(content).to.equal('foo=foo\nbar=baar\nbaz=baaz\nsec=$€1')
      return Promise.resolve()
    })
    sandbox.stub(fs, 'remove').callsFake((file) => {
      expect(file).to.equal('.env')
      return Promise.resolve()
    })
    sandbox.stub(serverless.cli, 'log')
    return envGenerator.hooks['before:deploy:createDeploymentArtifacts']().then(_ =>
      envGenerator.hooks['after:deploy:createDeploymentArtifacts']()
    ).then(_ => {
      expect(fs.writeFile.callCount).to.equal(1)
      expect(fs.remove.callCount).to.equal(1)
    })
  })

  it('should write and keep .env file upon manual generation', () => {
    initEnvGenerator({
      keepEnvFile: true
    })
    sandbox.stub(helper, 'getEnvVars').callsFake(() => {
      return Promise.resolve(defaultEnvFiles)
    })
    sandbox.stub(fs, 'writeFile').callsFake((file, content) => {
      return Promise.resolve()
    })
    sandbox.stub(fs, 'remove').callsFake(_ => {
      return Promise.resolve()
    })
    return envGenerator.hooks['env:generate:write']().then(_ => {
      expect(fs.writeFile.callCount).to.equal(1)
      expect(fs.remove.callCount).to.equal(0)
    })
  })

  it('should work with single kms key', () => {
    serverless.service.custom.envEncryptionKeyId = 'allthesinglekeys'
    initEnvGenerator({})
    sandbox.stub(helper, 'getEnvVars').callsFake((attribute, decrypt, config) => {
      expect(config.kmsKeyId).to.equal('allthesinglekeys')
      return Promise.resolve(defaultEnvFiles)
    })
    sandbox.stub(serverless.cli, 'log')
    return envGenerator.hooks['env:env']().then(_ => {
      expect(helper.getEnvVars.callCount).to.equal(1)
    })
  })

  it('should set environment when local-dev-server is started', () => {
    var options = {}
    initEnvGenerator(options)
    sandbox.stub(helper, 'getEnvVars').callsFake((attribute, decrypt, config) => {
      expect(attribute).to.eql(undefined)
      expect(decrypt).to.equal(true)
      expect(config.region).to.equal('eu-central-1')
      expect(config.stage).to.equal('dev')
      expect(config.profile).to.equal('myproject-dev')
      expect(config.yamlPaths).to.eql(['some/path.yml', 'some/otherPath.yml'])
      expect(config.kmsKeyId).to.equal('somedevkey')
      return Promise.resolve(defaultEnvFiles)
    })
    sandbox.stub(serverless.cli, 'log')
    return envGenerator.hooks['local-dev-server:loadEnvVars']().then(_ => {
      expect(options.environment.foo).to.equal('foo')
      expect(options.environment.bar).to.equal('baar')
      expect(options.environment.baz).to.equal('baaaz')
    })
  })
})
