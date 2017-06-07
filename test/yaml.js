/* global describe it beforeEach afterEach */
const expect = require('chai').expect
const sinon = require('sinon')
const fs = require('fs-extra')
const yaml = require('../src/yaml')

const yamlText = `
dev:
  foo: bar
prod:
  foo: baz`

const yamlDoc = {
  dev: { foo: 'bar' },
  prod: { foo: 'baz' }
}

describe('yaml.js', () => {
  var sandbox

  beforeEach(() => {
    sandbox = sinon.sandbox.create()
  })

  afterEach((done) => {
    sandbox.restore()
    done()
  })

  it('should read YAML files', () => {
    sandbox.stub(fs, 'readFile').callsFake(path => {
      expect(path).to.equal('./some/path.yml')
      return Promise.resolve(yamlText)
    })
    return yaml.read('./some/path.yml').then(result => {
      expect(result).eql(yamlDoc)
    }).then(_ => {
      expect(fs.readFile.callCount).to.equal(1)
    })
  })

  it('should read empty YAML files', () => {
    sandbox.stub(fs, 'readFile').callsFake(path => {
      expect(path).to.equal('./some/path.yml')
      return Promise.resolve('')
    })
    sandbox.stub(console, 'warn')
    return yaml.read('./some/path.yml').then(result => {
      expect(fs.readFile.callCount).to.equal(1)
      expect(result).to.equal(undefined)
    })
  })

  it('should create new file if YAML file does not exist', () => {
    sandbox.stub(fs, 'writeFile').callsFake((path, content) => {
      expect(path).to.equal('./some/path.yml')
      expect(content).to.equal(yamlText)
    })
  })
  return yaml.write(yamlDoc, './some/path.yml').then(_ => {
    expect(fs.writeFile.callCount).to.equal(1)
  })
})
