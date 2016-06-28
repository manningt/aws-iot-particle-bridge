
var logger = require('nodejslogger');
logger.init({"mode":"D"}) //Enable only debug logs
//logger.init({"mode":"E"}) //Enable only error logs

const cmdLineProcess = require('aws-iot-device-sdk/examples/lib/cmdline');
const thingShadow = require('aws-iot-device-sdk').thingShadow;
var particleFunctionNames = {};

function processTest(args) {
   const thingShadows = thingShadow({
      keyPath: args.privateKey,
      certPath: args.clientCert,
      caPath: args.caCert,
      clientId: args.clientId,
      region: args.region,
      baseReconnectTimeMs: args.baseReconnectTimeMs,
      keepalive: args.keepAlive,
      protocol: args.Protocol,
      port: args.Port,
      host: args.Host,
      debug: args.Debug
   });

  thingShadows.on('connect', function() {
    logger.debug('(aws) connected to AWS IoT');
  });

  thingShadows.on('status', function(thingName, stat, clientToken, stateObject) {
    var logEntry = '(aws) received: ' + stat + ' status on: ' + thingName; //+ JSON.stringify(stateObject);
    //logger.debug(logEntry);

    if (stat = 'accepted') {
      // extract desired state and shorten key names to 3 characters
      //  because particle.function areguments are limited to 63 characters
      var desiredState = {};
      var desiredStateKeyCount = 0;
      for (var key in stateObject.state.desired) {
        desiredState[key.substring(0, 3)] = stateObject.state.desired[key];
        desiredStateKeyCount += 1;
      }
      if (desiredStateKeyCount > 0) {
        //logEntry = '(particle) calling function: ' + particleFunctionName + ' with argument: ' + JSON.stringify(desiredState) + ' for coreId: ' + thingName;
        logEntry = '(particle) calling function: ' + particleFunctionNames[thingName] + ' with argument: ' + JSON.stringify(desiredState) + ' for coreId: ' + thingName;
        logger.debug(logEntry);

        //var fnPr = particle.callFunction({ deviceId: thingName, name: particleFunctionName, argument: JSON.stringify(desiredState), auth: token });
        var fnPr = particle.callFunction({ deviceId: thingName, name: particleFunctionNames[thingName], argument: JSON.stringify(desiredState), auth: token });
        fnPr.then(
          function (data) {
            logEntry = '(particle) function ' + particleFunctionName + ' return value: ' + data.body.return_value;
            logger.debug(logEntry);
          }, function (err) {
            if (err.statusCode === 404) {
              logEntry = '(particle) coreId: ' + data.coreid  + ' does NOT support function: ' + particleFunctionName;
            } else logEntry = '(particle) function error: ' + err.errorDescription + '\n' + err.body;
            logger.error(logEntry);
          });
        }
      } else {
        var logEntry = '(aws) received: ' + stat + ' status on: ' + thingName;
        logger.error(logEntry);
      }
  });

  var token = args.thingName;
  var particleModule = require('particle-api-js');
  var particle = new particleModule();

  const PARTICLE_FUNCTION_ADVERTISEMENT = "function";
//  var particleFunctionName = null;

  particle.getEventStream({ deviceId: 'mine', auth: token }).then(function(stream) {
    stream.on('event', function(data) {
      var logEntry = '(particle) event received: ' + JSON.stringify(data);
      logger.debug(logEntry);

      if (data.name === PARTICLE_FUNCTION_ADVERTISEMENT) {
        particleFunctionNames[data.coreid] = data.data;
        logEntry = '(aws) registering for coreId: ' + data.coreid;
        logger.debug(logEntry);
        thingShadows.register(data.coreid, { ignoreDeltas: true });

        logEntry = '(aws) getting state for coreId: ' + data.coreid;
        logger.debug(logEntry);
        setTimeout(function(){thingShadows.get(data.coreid)},1000);
      }
      else if (data.name === "stateReport") {
        // add state reported hierarchy for AWS-IOT
        var update =
        { "state": { "reported" : JSON.parse(data.data.toString()) } }

        logEntry = '(aws) updating state for coreId: ' + data.coreid;
        logger.debug(logEntry);
        var clientToken = thingShadows.update(data.coreid, update);
      }
      /*
      else if (data.data === "offline") {
        logEntry = '(aws) unregistering for coreId: ' + data.coreid;
        logger.debug(logEntry);
        thingShadows.unregister(data.coreid);
      }
      */
    });
  });

}

module.exports = cmdLineProcess;

if (require.main === module) {
   cmdLineProcess('synchronize AWS IoT thing shadows with Particles',
      process.argv.slice(2), processTest);
}
