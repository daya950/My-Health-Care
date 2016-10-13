'use strict';
var APP_SECRET = 'e658fe4b775b4c04913c5a15a4169781';
var VALIDATION_TOKEN = 'MY_CHAT_TOKEN';
var PAGE_ACCESS_TOKEN = 'EAAZAxj43rP40BABZBQ4RT2ZBWhSnRuUl19vEf56vgZCMak8OTa9fO9de5bMjvgEQAuuh0rgoj7qyZBP2MZA9ZAk2PVd84AtgOUgoZBpS2pNjF5Vzida2DmOHl9PStVmuXAZCW94ZA7UElJEWxfrhfnZAck4slIxvb5tEwutWDcJvKeIZAAZDZD';
var seq = 0;

var bodyParser = require('body-parser'), 
config = require('config'), 
crypto = require('crypto'), 
express = require('express'), 
http = require('http'), 
request = require('request');

function verifyRequestSignature(req, res, buf) {
	var signature = req.headers["x-hub-signature"];
	if (!signature) {
		console.error("Couldn't validate the signature.");
	} else {
		var elements = signature.split('=');
		var method = elements[0];
		var signatureHash = elements[1];
		var expectedHash = crypto.createHmac('sha1', APP_SECRET).update(buf).digest('hex');

		if (signatureHash !== expectedHash) {
			throw new Error("Couldn't validate the request signature.");
		}
	}
}

var app = express();
app.set('port', (process.env.PORT || 3000));
app.set('view engine', 'ejs');
app.use(bodyParser.json({verify : verifyRequestSignature}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended : false}));
app.use(express.static('public'));

app.get('/webhook', function(req, res) {
	if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === VALIDATION_TOKEN) {
		console.log("Validating webhook");
		res.status(200).send(req.query['hub.challenge']);
	} else {
		console.error("Failed validation. Make sure the validation tokens match.");
		res.sendStatus(403);
	}
});


/*
 * This path is used for account linking. The account linking call-to-action
 * (sendAccountLinking) is pointed to this URL.
 * 
 */
app.get('/authorize', function(req, res) {
	var accountLinkingToken = req.query.account_linking_token;
	var redirectURI = req.query.redirect_uri;

	// Authorization Code should be generated per user by the developer. This
	// will
	// be passed to the Account Linking callback.
	var authCode = "1234567890";

	// Redirect users to this URI on successful login
	var redirectURISuccess = redirectURI + "&authorization_code=" + authCode;

	res.render('authorize', {
		accountLinkingToken : accountLinkingToken,
		redirectURI : redirectURI,
		redirectURISuccess : redirectURISuccess
	});
});

/*
 * Call the Send API. The message data goes in the body. If successful, we'll
 * get the message id in a response
 * 
 */
function callSendAPI(messageData) {
	request({
		uri : 'https://graph.facebook.com/v2.6/me/messages',
		qs : {
			access_token : PAGE_ACCESS_TOKEN
		},
		method : 'POST',
		json : messageData

	}, function(error, response, body) {
		if (!error && response.statusCode === 200) {
			var recipientId = body.recipient_id;
			var messageId = body.message_id;

			if (messageId) {
				console.log("Successfully sent message with id %s to recipient %s",	messageId, recipientId);
			} else {
				console.log("Successfully called Send API for recipient %s", recipientId);
			}
		} else {
			console.error("Failed calling Send API", response.statusCode, response.statusMessage, body.error);
		}
	});
}

function sendTextMessage(recipientId, messageText) {
	var messageData = {
		recipient : {
			id : recipientId
		},
		message : {
			text : messageText,
			metadata : "DEVELOPER_DEFINED_METADATA"
		}
	};
	callSendAPI(messageData);
}

function getMessageForFb(key, id, token, recId, sequence) {
	console.log('IIIIIIIIIIIIIIII');
	console.log(key);
	console.log(id);
	console.log(token);
	console.log(recId);
	console.log(sequence);
	console.log('OOOOOOOOOOOOOOOO');
	request({
		uri : 'https://msquare-developer-edition.ap2.force.com/services/apexrest/sfdcwebhook',
		method : 'GET',
		body: '{"key" : '+key+', "id" : '+id+', "token" : '+token+', "recId" : '+recId+', "seq" : '+sequence+'}'

	}, function(error, response, body) {
		if (!error && response.statusCode === 200) {
			console.log('XXXXXXXXXXXXXXXXXXXXX');
			console.log(recId);
			console.log(response.headers.sfdcmsg);
			console.log(response.headers.Key);
			console.log(response.headers.Id);
			console.log(response.headers.AffinityToken);
			console.log(response.headers.Seq);
			console.log('YYYYYYYYYYYYYYYYYYYY');
			sendTextMessage(recId, response.headers.sfdcmsg);
			seq = response.headers.seq;
			console.log("Message Sent");
		} else {
			console.error("Failed calling Send API", response.statusCode, response.statusMessage, body.error);
		}
	});
	//getMessageForFb(key, id, token, recId, seq);
}


/*
 * Message Event
 * 
 * This event is called when a message is sent to your page. The 'message'
 * object format can vary depending on the kind of message that was received.
 * 
 * If we receive a message with an attachment (image, video, audio), then we'll
 * simply confirm that we've received the attachment.
 * 
 */
function receivedMessage(event) { 
	var senderID = event.sender.id;
	var recipientID = event.recipient.id;
	var timeOfMessage = event.timestamp;
	var message = event.message.text;
	var arr;
	
	request({
		uri : 'https://msquare-developer-edition.ap2.force.com/services/apexrest/sfdcwebhook?text='+message+'&recId='+senderID,
		method : 'POST'
	}, function (error, response, body) {
		console.log('XXXXXXXXXXXXXXXXXXXXX');
		console.log(body.split('@COL@')[1]);
		console.log(body.split('@COL@')[2]);
		console.log(body.split('@COL@')[3]);
		console.log(body.split('@COL@')[4]);
		console.log(senderID);
		console.log(seq);
		console.log('YYYYYYYYYYYYYYYYYYYY');
		if (response.headers.sendStatus === body.split('@COL@')[1]) {
			getMessageForFb(body.split('@COL@')[2], body.split('@COL@')[3], body.split('@COL@')[4], senderID, seq);
		}
		
		if (!error && response.statusCode === 200) {
			console.log(error+"  "+response.statusCode);
		} else {
			console.error("Error Occured in receivedMessage Function ", response.statusCode, response.statusMessage, body.error);
		}
	});
}


/*
 * Delivery Confirmation Event
 * 
 * This event is sent to confirm the delivery of a message. Read more about
 * 
 */
function receivedDeliveryConfirmation(event) {
	var senderID = event.sender.id;
	var recipientID = event.recipient.id;
	var delivery = event.delivery;
	var messageIDs = delivery.mids;
	var watermark = delivery.watermark;
	var sequenceNumber = delivery.seq;

	if (messageIDs) {
		messageIDs.forEach(function(messageID) {
			console.log("Received delivery confirmation for message ID: %s", messageID);
		});
	}

	console.log("All message before %d were delivered.", watermark);
}


/*
 * Postback Event
 *
 * This event is called when a postback is tapped on a Structured Message. 
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/postback-received
 * 
 */
function receivedPostback(event) {
  var senderID = event.sender.id;
  var recipientID = event.recipient.id;
  var timeOfPostback = event.timestamp;

  // The 'payload' param is a developer-defined field which is set in a postback 
  // button for Structured Messages. 
  var payload = event.postback.payload;

  console.log("Received postback for user %d and page %d with payload '%s' " + 
    "at %d", senderID, recipientID, payload, timeOfPostback);

  // When a postback is called, we'll send a message back to the sender to 
  // let them know it was successful
  sendTextMessage(senderID, "Postback called");
}


/*
 * Message Read Event
 *
 * This event is called when a previously-sent message has been read.
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/message-read
 * 
 */
function receivedMessageRead(event) {
  var senderID = event.sender.id;
  var recipientID = event.recipient.id;

  // All messages before watermark (a timestamp) or sequence have been seen.
  var watermark = event.read.watermark;
  var sequenceNumber = event.read.seq;

  console.log("Received message read event for watermark %d and sequence " +
    "number %d", watermark, sequenceNumber);
}


/* All callbacks for Messenger are POST-ed. They will be sent to the same
 * webhook.
 */
app.post('/webhook', function(req, res) {
	var data = req.body;
	if (data.object === 'page') {
		data.entry.forEach(function(pageEntry) {
			var pageID = pageEntry.id;
			var timeOfEvent = pageEntry.time;
			pageEntry.messaging.forEach(function(messagingEvent) {
				if (messagingEvent.message) {
					receivedMessage(messagingEvent);
				} else if (messagingEvent.delivery) {
					receivedDeliveryConfirmation(messagingEvent); 
				} else if (messagingEvent.postback) {
					receivedPostback(messagingEvent);
				} else if (messagingEvent.read) {
					receivedMessageRead(messagingEvent);
				} else {
					console.log("Webhook received unknown messagingEvent: ",messagingEvent);
				}
			});
		});

		// Assume all went well
		// 200 must be sent, within 20 seconds, to let fb know we've
		// successfully received the callback. Otherwise, the request will time
		// out.
		res.sendStatus(200);
	}
});



/*  http.createServer(app).listen(app.get('port'), function() {
	  console.log('Express server listening on port ' + app.get('port'));
  });*/
 

app.listen(app.get('port'), function() {
	console.log('Node app is running on port', app.get('port'));
});