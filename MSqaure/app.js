'use strict';
var APP_SECRET = 'e658fe4b775b4c04913c5a15a4169781';
var VALIDATION_TOKEN = 'MY_CHAT_TOKEN';

var bodyParser = require('body-parser'),
	config = require('config'),
	crypto = require('crypto'),
	express = require('express'),
	http = require('http'),  
	request = require('request');


 function verifyRequestSignature(req, res, buf) {
	var signature = req.headers["x-hub-signature"];
	console.log(signature);
	if (!signature) {
		console.error("Couldn't validate the signature.");
	} else {
		var elements = signature.split('=');
		console.log("OYE OYE "+elements);
		var method = elements[0];
		var signatureHash = elements[1];
		var expectedHash = crypto.createHmac('sha1', APP_SECRET)
		.update(buf)
		.digest('hex');

		console.log(elements);
		console.log(expectedHash);
		
		if (signatureHash !== expectedHash) {
			throw new Error("Couldn't validate the request signature.");
		}
	}
}

var app = express();
app.set('port', (process.env.PORT || 3000));
app.set('view engine', 'ejs');
app.use(bodyParser.json({ verify: verifyRequestSignature }));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));
app.use(express.static('public'));

/*
 * Use your own validation token. Check that the token used in the Webhook 
 * setup is the same token used here.
 *
 */
app.get('/webhook', function(req, res) {
  if (req.query['hub.mode'] === 'subscribe' &&
      req.query['hub.verify_token'] === VALIDATION_TOKEN) {
    console.log("Validating webhook");
    res.status(200).send(req.query['hub.challenge']);
  } else {
    console.error("Failed validation. Make sure the validation tokens match.");
    res.sendStatus(403);          
  }  
});

http.createServer(app).listen(app.get('port'), function(){
	  console.log('Express server listening on port ' + app.get('port'));
	});