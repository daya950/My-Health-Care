'use strict';
var APP_SECRET = 'e658fe4b775b4c04913c5a15a4169781';
var VALIDATION_TOKEN = 'MY_CHAT_TOKEN';
var PAGE_ACCESS_TOKEN = 'EAAZAxj43rP40BALkZADBUMBHmoY3AMu4hTgqZAj1VNesZBoTrjZBe4sI1HiWORJsJayIINl0G0Vnoh2DQKyKoIXFucpUDGTvzJSAI0Ubhbxiz72ldCZBJotY2P81BfbBSHVxi3327RAXswAkBWKwHY5SQPgZAHPLkQJdrf7umr8uQZDZD';

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

function getMessageAndSendToFb(recipient, sequenceNum) {
	console.log('URL : https://msquare-developer-edition.ap2.force.com/services/apexrest/sfdcwebhook?recId='+recipient+'&seqNum='+sequenceNum);
	request({
		uri : 'https://msquare-developer-edition.ap2.force.com/services/apexrest/sfdcwebhook?recId='+recipient+'&seqNum='+sequenceNum,
		method : 'GET'
	}, function(error, response, body) {
		console.log(body);
		if (body.split('@')[1] === '1') {
			setTimeout( function() {getMessageAndSendToFb(recipient, sequenceNum);}, 1000);	
		}
	});
}


/*
 * To Insert Session Details in Salesforce Database 
 */
function insertSessionDetails(recId, chatType, msg) {
	request({
		uri : 'https://msquare-developer-edition.ap2.force.com/services/apexrest/fbsfdcchatdb?recId='+recId+'&chatType='+chatType+'&message='+msg,
		method : 'POST'			
	}, function (error, response, body) {
		console.log('METHOD : insertSessionDetails\nERROR : '+error+'\nRESPONSE : '+response+'\nBODY : '+body);
		if (chatType === '@LA@') {
			getMessageAndSendToFb(recId, 0);
		}
	});
}

/*
 * To Send Message to Facebook User from Knowledge Center 
 */
function sendMessageKmToFb(recId, message) {
	request({
		uri : 'http://50.202.96.113:9226/infocenter/api/v1/search/?q='+message+'&type=narrow&fac=CMS-CHANNEL.FAQ',
		method : 'GET'			
	}, function (error, response, body) {
		var data = JSON.parse(body);
		var msg;
		if (data.hasOwnProperty('results')) {
			msg = data.results[0].excerpt.replace(/<[^>]+>/gm, '').replace(/&nbsp;/g, ' ').replace(/&rsquo;/, '\'').replace(/(&ldquo;)|(&rdquo;)/g, '"');
		} else {
			insertSessionDetails(recId, '@LA@','Nothing');
			sendTextMessage(recId, 'We are unable to find results for your query, One of our Representative has been connected to solve your queries, Start Conversation Now');
		}
		console.log('METHOD : sendMessageKmToFb\nERROR : '+error+'\nRESPONSE : '+response+'\nBODY_EXCERPT : '+msg);
		sendTextMessage(recId, msg);
	});
}


/*
 * To Send Message from Facebook User to  Salesforce Live Agent
 */
function sendMessageFbToSfdc(recId, message) {
	request({
		uri : 'https://msquare-developer-edition.ap2.force.com/services/apexrest/sfdcwebhook?text='+message+'&recId='+recId,
		method : 'POST'
	}, function (error, response, body) {
		if (!error && response.statusCode === 200) {
			console.log("Message to Salesforce Agent Have been Successfully Sent");
		} else {
			console.error("Error Occured in Sending Message to  Salesforce Agent in sendMessageFbToSfdc Function ", response.statusCode, response.statusMessage, body.error);
		}
	});
}

/*
 * Message Event
 * 
 * This event is called when a message is sent to your page. The 'message'
 * object format can vary depending on the kind of message that was received.
 * 
 */
function receivedMessage(event) { 
	var senderID = event.sender.id;
	var recipientID = event.recipient.id;
	var timeOfMessage = event.timestamp;
	var message = event.message.text;
	let match;
	request({
		uri : 'https://msquare-developer-edition.ap2.force.com/services/apexrest/fbsfdcchatdb?recId='+senderID,
		method : 'GET',
		timeout: 60000
	}, function (error, response, body) {
		var responseMsg;
		if (body.split('@')[1] === 'EM') {
			if(message.match(/hi/i) || message.match(/hello/i) || message.match(/heyy/i)) {
				var textArray = ['Hello, how can i help you today','Hi','Heyy','Hi, nice to see you'];
				var randomNumber = Math.floor(Math.random()*textArray.length);
				sendTextMessage(senderID, textArray[randomNumber]+'\n\nType \"query\" if you have any query \nType \"case\" to register a case '
						+'\nType \"agent\" to chat with our representative.');
			} else if(message.match(/query/i)) {
				sendTextMessage(senderID, 'Anytime you want to register a case Type \"case\" or type \"agent\" to chat with our representative.\n\nI am Listening, Ask your query');
				insertSessionDetails(senderID, '@CQ@', 'Nothing');
			} else if(message.match(/case/i) || message.match(/issue/i)) {
				insertSessionDetails(senderID, '@CR@','Nothing');
				sendTextMessage(senderID, 'Enter your detailed issue, we will register a complain and will get back to you soon after resolve it.');
			} else if(message.match(/agent/i)) {
				insertSessionDetails(senderID, '@LA@','Nothing');
				sendTextMessage(senderID, 'Agent Connected, Start Your Conversation');
			} else {
				sendTextMessage(senderID, 'I am always here to help you \n\nType \"query\" if you have any query \nType \"case\" to register a case'
						+'\nType \"agent\" to chat with our representative.');
			}
		} else if (body.split('@')[1] === 'CQ') {
			try {
				if (message.match(/agent/i)) {
					insertSessionDetails(senderID, '@LA@','Nothing');
					sendTextMessage(senderID, 'Agent Connected, Start Your Conversation');
				} else if (message.match(/case/i) || message.match(/issue/i)) {
					insertSessionDetails(senderID, '@CR@','Nothing');
					sendTextMessage(senderID, 'If you have more query feel free to type \"query\" or type \"agent\" to let our representative understand your concern'
									+'\n\nEnter your detailed issue to register a case');
				} else {
					sendMessageKmToFb(senderID, message);				
				}
			} catch (err) {
			   sendTextMessage(senderID, 'I am not feeling good to tell you anything right now. Ask me later.');
			}
		} else if (body.split('@')[1] === 'CR') {
			sendTextMessage(senderID, 'Your Case Have been logged, Kindly Check your mail\n\nI am always here to help you \n\nType \"query\" if you have any query \nType \"case\" to register a case'
						+'\nType \"agent\" to chat with our representative.');
			insertSessionDetails(senderID, '@CC@', message);
		} else {
			sendMessageFbToSfdc(senderID, message);
		}
	});
}



/*
 * Delivery Confirmation Event
 * 
 * This event is sent to confirm the delivery of a message.
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
