"use strict";
require("babel-core/register");
require("babel-polyfill");

const PouchDB: any = require('pouchdb-node');
var db = new PouchDB('localdb');

var doc = {
  "_id": "mittens",
  "name": "Mittens",
  "occupation": "kitten",
  "age": 3,
  "hobbies": [
    "playing with balls of yarn",
    "chasing laser pointers",
    "lookin' hella cute"
  ]
};

(async function() {
	try {
		console.log("test");
		let resp = await db.put(doc);
		console.log(resp);
		
		let doc = await db.get('mittens');
		console.log(doc);
	} catch(err) {
		console.log("err", err);
	}
})();

