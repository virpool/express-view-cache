var adapterMemory = require('./lib/adapterMemory.js'),
    adapterMemJS = require('./lib/adapterMemJS.js'),
    adapterRedis = require('./lib/adapterRedis.js');

// Caching middleware for Express framework
// details are here https://github.com/vodolaz095/express-view-cache

function createCacheKeyDefault(request) {
    return request.originalUrl;
}

function isFunction(obj) {
    return !!(obj && obj.call && obj.apply);
}

module.exports = function (invalidateTimeInMilliseconds, parameters) {
    if (!invalidateTimeInMilliseconds || isNaN(invalidateTimeInMilliseconds)) {
        invalidateTimeInMilliseconds = 60*1000; //1 minute
    }

    parameters = parameters || {};

    var cache;
    if (parameters.driver) {
        switch (parameters.driver) {
            case 'memjs':
                cache = adapterMemJS;
                break;
            case 'redis':
                cache = adapterRedis;
                break;
            default:
                cache = adapterMemory;
        }
    } else {
        cache = adapterMemory;
    }

    var sendMethod  = parameters.jsonp ? 'jsonp' : 'send',
        rawJSON     = !!parameters.rawJSON;

    return function (request, response, next) {
        if (isFunction(parameters.filter) && parameters.filter(request) === false) return next();

        if (parameters.type) {
            response.type(parameters.type);
        }
        if (request.method == 'GET') {
            var targetKey = (parameters.createCacheKey || createCacheKeyDefault)(request);
            cache.get(targetKey, function (err, value) {
                if (value) {
                    //console.log('FRONT_CACHE HIT: GET '+targetKey);
                    if (rawJSON) {
                        value = JSON.parse(value); // TODO: figure about it
                    }
                    response.header('Cache-Control', "public, max-age="+Math.floor(invalidateTimeInMilliseconds/1000)+", must-revalidate");
                    response[sendMethod](value);
                    return true;
                } else if (rawJSON) {
                    var jsonp = response.jsonp;
                    response.jsonp = function (status, body) {
                        response.jsonp = jsonp;

                        var data = isNaN(status) ? status : body;
                        response.on('finish', function () {
                            cache.set(targetKey, JSON.stringify(data), function (err, result) {
                                if (err) throw err;
                            }, invalidateTimeInMilliseconds);
                        });
                        response.header('Cache-Control', "public, max-age="+Math.floor(invalidateTimeInMilliseconds/1000)+", must-revalidate");
                        if (body) {
                            response.jsonp(status, body);
                        } else {
                            response.jsonp(status);
                        }
                    };
                    return next();
                } else {
                    //http://stackoverflow.com/questions/13690335/node-js-express-simple-middleware-to-output-first-few-characters-of-response?rq=1
                    var end = response.end;
                    response.end = function (chunk, encoding) {
                        response.end = end;
                        response.on('finish', function () {
                            cache.set(targetKey, chunk, function (err, result) {
                                if (err) throw err;
                                /*if (result) {
                                    console.log('FRONT_CACHE SAVED: GET '+targetKey);
                                } else {
                                    console.log('FRONT_CACHE ERROR SAVING: GET '+targetKey)
                                }*/
                            },invalidateTimeInMilliseconds);
                        });
                        response.header('Cache-Control', "public, max-age="+Math.floor(invalidateTimeInMilliseconds/1000)+", must-revalidate");
                        response.end(chunk, encoding);
                    };
                    return next();
                }
            });
        } else {
            return next();
        }
    }
}
