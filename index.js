#!/usr/bin/env node

process.title = 'ddbd'

var dwebDns = require('@dwebs/dns')()
var wss = require('websocket-stream')
var vaultr = require('@ddatabase/vaultr')
var flock = require('ddb-vaultr/flock')
var readFile = require('read-file-live')
var minimist = require('minimist')
var path = require('path')
var dWebChannel = require('@dwcore/channel')
var http = require('http')

var argv = minimist(process.argv.slice(2))
var cwd = argv.cwd || process.cwd()
var ar = vaultr(path.join(cwd, 'vaultr'), argv._[0])
var server = http.createServer()
var port = argv.port || process.env.PORT || 0
var unencryptedWebsockets = !!argv['unencrypted-websockets']

if (argv.help) {
  console.log(
    'Usage: ddbd [key?] [options]\n\n' +
    '  --cwd         [folder to run in]\n' +
    '  --websockets  [share over websockets as well]\n' +
    '  --port        [explicit websocket port]\n' +
    '  --no-flock    [disable flocking]\n'
  )
  process.exit(0)
}

if (unencryptedWebsockets) {
  argv.websockets = true
}

ar.on('sync', function (ddb) {
  console.log('Fully synced', ddb.key.toString('hex'))
})

ar.on('add', function (ddb) {
  console.log('Adding', ddb.key.toString('hex'))
})

ar.on('remove', function (ddb) {
  console.log('Removing', ddb.key.toString('hex'))
})

ar.on('changes', function (ddb) {
  console.log('Vaultr key is ' + ddb.key.toString('hex'))
})

console.log('Watching %s for a list of active ddbs', path.join(cwd, 'ddbs'))

wss.createServer({server: server}, onwebsocket)
server.on('request', function (req, res) {
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify({
    name: 'ddbd',
    version: require('./package').version
  }))
})

if (argv.flock !== false) {
  flock(ar, {live: true}).on('listening', function () {
    console.log('Flock listening on port %d', this.address().port)
  })
}

if (argv.websockets === true) {
  server.listen(port, function () {
    console.log('WebSocket server listening on port %d', server.address().port)
  })
}

function resolveAll (links, cb) {
  var keys = []
  var missing = links.length

  if (!missing) return cb(null, [])

  for (var i = 0; i < links.length; i++) {
    dwebDns.resolveName(links[i], function (_, key) {
      keys.push(key)
      if (!--missing) cb(null, keys.filter(Boolean))
    })
  }
}

readFile(path.join(cwd, 'ddbs'), function (file) {
  resolveAll(file.toString().trim().split('\n'), function (err, ddbs) {
    if (err) return

    ar.list(function (err, keys) {
      if (err || !ar.changes.writable) return

      var i = 0

      for (i = 0; i < keys.length; i++) {
        if (ddbs.indexOf(keys[i].toString('hex')) === -1) ar.remove(keys[i])
      }
      for (i = 0; i < ddbs.length; i++) {
        ar.add(ddbs[i])
      }
    })
  })
})

function onwebsocket (stream) {
  dWebChannel(stream, ar.replicate({live: true, encrypt: !unencryptedWebsockets}), stream)
}
