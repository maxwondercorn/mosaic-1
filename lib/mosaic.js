var async = require('async')
var fs = require('fs')
var helpers = require('./helpers')
var image = require('./image')
var path = require('path')


// start / create temp directory

module.exports.make = function(config) {
  helpers.mkdirp(config.tmp, function() {
    if (config.images) getSource(config)
    else getFileList(config)
  })
}


// get image info and save temps

var getFileList = function(config) {
  var images = []
  var exts = new RegExp('.(jpg|png)$')
  fs.readdir(config.dir, function(err, res) {
    res.forEach(function(file) {
      if (exts.test(file)) images.push(file)
    })
    loadImages(config, images)
  })
}

var loadImages = function(config, images) {
  config.images = []
  async.forEachSeries(images, function(fileName, next) {
    helpers.log('loading', fileName)
    var file = path.join(config.dir, fileName)
    image.get(file, config.dims, function(img) {
      file = path.join(config.tmp, fileName)
      image.save(img, file, function() {
        var avg = image.average(img)
        config.images.push({ file: fileName, avg: avg })
        next()
      })
    })
  }, function() {
    config.images.sort(function(a, b) {
      return b.avg[3]-a.avg[3]
    })
    getSource(config)
  })
}


// get source image pixels

var getSource = function(config) {
  helpers.log('reading', path.basename(config.src))
  image.get(config.src, config.grid, function(img) {
    var pixels = image.pixels(img)
    img = null
    comp(config, pixels)
  })
}


// place images

var comp = function(config, pixels) {
  var i = 0
  var ctx = image.ctx(config.width, config.height)
  var total = config.grid.height*config.grid.width
  
  var iterate = function() {
    async.forEachSeries(config.images, function(img, next) {
      i++
      if (i > total) return next()
      helpers.log('matching', path.basename(config.save), i+'/'+total)
      
      var key = match(img, pixels)
      var pixel = pixels[key]
      pixels[key] = null    
      add(config, ctx, img.file, pixel, key, next)
    }, function() {
      if (i < total) return iterate()
      pixels = null
      save(config, ctx)
    })
  }
  iterate()
}

var match = function(img, pixels) {
  var min = 999999999999999
  var key = 0
  pixels.forEach(function(pixel, i) {
    if (pixel === null) return
    var dist = image.distance(img.avg, pixel)
    if (dist < min) min = dist, key = i
  })
  return key
}

var add = function(config, ctx, file, pixel, key, cb) {
  file = path.join(config.tmp, file)
  image.get(file, function(img) {
    var t = tint(config, img, pixel)
    var x = (key%config.grid.width)*config.dims.width
    var y = Math.floor(key/config.grid.width)*config.dims.height
    ctx.drawImage(t.canvas, x, y, config.dims.width, config.dims.width)
    img = null
    t = null
    cb()
  })
}

var tint = function(config, img, pixel) {
  var h = config.dims.height
  var w = config.dims.width
  var ctx = image.ctx(w, h)
  ctx.fillStyle = image.hex(pixel)
  ctx.fillRect(0, 0, w, h)
  ctx.globalAlpha = config.tint
  ctx.drawImage(img.canvas, 0, 0)
  return ctx
}


// save / clean up

var save = function(config, ctx) {
  helpers.log('saving', path.basename(config.save))
  image.save(ctx, config.save, function() {
    ctx = null
    if (config.cb) config.cb()
  })
}