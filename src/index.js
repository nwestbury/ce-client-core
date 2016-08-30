/* Written by Nathan Liebrecht (c) */

"use strict";
require("babel-polyfill");

import { Component, PropTypes, Children } from 'react';
import { connect } from 'react-redux';

// Polyfill for pouchdb works for PouchDB 5.4.5, DO NOT UPGRADE!
// Summary: pouch expects the following:
// -an implementation of the standard openDatabase which we fudge (new between 5.3.1->5.4.5)
// -the following polyfils: Buffer, atob, btoa, blob, process.nextTick
// -a websql plugin

global.Buffer = global.Buffer || require('buffer').Buffer;
global.atob = global.atob || require('atob');
global.btoa = global.btoa || require('btoa');
require('blob-polyfill');
window.openDatabase = window.openDatabase || true;
window.sqlitePlugin = window.sqlitePlugin || require('react-native-sqlite-storage');
process.nextTick = process.nextTick || setImmediate;

const PouchDB = require('pouchdb-core');
PouchDB.plugin(require('pouchdb-adapter-websql'))
        .plugin(require('pouchdb-adapter-http'))
        .plugin(require('pouchdb-replication'))
		.plugin(require('pouchdb-upsert'));


/////
//redux actions

function updateLastSeq(seq) {
	return {
		type: "UPDATE_LAST_SEQ",
		seq: seq,
	}
}

//adds or deletes copy
function upsertCopy(copyObj) {
	return {
		type: 'UPSERT_COPY',
		copyObj: copyObj,
	}
}

/////
//redux reducer

function binarySearch(arr, docId) {
  var low = 0, high = arr.length, mid;
  while (low < high) {
    mid = (low + high) >>> 1; // faster version of Math.floor((low + high) / 2)
    arr[mid]._id < docId ? low = mid + 1 : high = mid
  }
  return low;
}

const initialState = {
	lastSeq: 0,
	copies: [],
}

function copy(state = initialState, action) {
	if(action.type === 'UPDATE_LAST_SEQ') {
		return {...state, lastSeq: action.seq};
	}
	if(action.type === 'UPSERT_COPY') {
		let copies = { ...state.copies };
		const { copyObj } = action.copyObj;
		
		if(action.copyObj._deleted) {
			var index = binarySearch(copies, id);
			var copyObj = copies[index];
			if (copyObj && copyObj._id === id) {
				copies.splice(index, 1);
			}
		} else {
			var index = binarySearch(copies, newDoc._id);
			var copyObj = copies[index];
			if (copyObj && copyObj._id === newDoc._id) { // update
				copies[index] = newDoc;
			} else { // insert
				copies.splice(index, 0, newDoc);
			}
		}
		return {...state, copies: copies };
	}
	return state;
}

module.exports.copyReducer = copy;

/////
//database actions

function deleteClip(getDb, clipId) {
	let db = getDb();
	db.upsert(clipId, (doc) => ({...doc, _deleted: true}));
}

function addClip(getDb, clipObj) {
	let db = getDb();
	if(!clipObj._id.match(/clip\/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/))
		throw "invalid clip id format";
	
	db.put(clipObj);
}

/////
//database provider, use like the redux provider

const DatabaseProvider = connect(select, actions)(class extends Component {
	constructor() {
		super();
		
		this.localdb = null;
		this.remotedb = null;
		this.changeListener = null;
		this.liveReplicator = null;
		
		this.login = this.login.bind(this);
		this.logout = this.logout.bind(this);
		this.getLocalDb = this.getLocalDb.bind(this);
	}
	getChildContext() {
		let getDb = () => this.localdb;
		
		return {
			databaseActions: {
				deleteClip: deleteClip.bind(getDb, undefined),
				addClip: addClip.bind(getDb, undefined),
			}
		};
	}
	getLocalDb() {
		return this.localdb;
	}
	login(remotedbPath) {
		this.localdb = new PouchDB('localdb');
		this.remotedb = new PouchDB(remotedbPath);
		
		this.changeListener = this.localdb.changes({live: true, since: this.props.lastSeq, include_docs: true}).on('change', function (change) {
			let doc = change.doc;
			if (doc.type === 'clip') {
				this.props.upsertCopy(copyObj)
			}
		}).on('error', console.log.bind(console));
		
		this.liveReplicator = PouchDB.replicate(this.localdb, this.remotedb, {
			live: true,
			retry: true
		}).on('change', function (info) {
			console.log("// handle change");
		}).on('paused', function (err) {
			console.log("// replication paused (e.g. replication up to date, user went offline)");
		}).on('active', function () {
			console.log("// replicate resumed (e.g. new changes replicating, user went back online)");
		}).on('denied', function (err) {
			console.log("// a document failed to replicate (e.g. due to permissions)");
		}).on('complete', function (info) {
			console.log("// handle complete");
		}).on('error', function (err) {
			console.log("// handle error");
		});
	}
	logout() {
		this.changeListener.cancel();
		this.liveReplicator.cancel();
		this.localdb.destroy();
		this.remotedb.destroy();
	}
});

function select(store) {
	return {
		lastSeq: store.copylist.lastSeq,
	}
}

function actions(dispatch) {
	return {
		updateLastSeq: (lastSeq) => dispatch(updateLastSeq(lastSeq)),
		upsertCopy: (copyObj) => dispatch(upsertCopy(copyObj))
	}
}

/////
//database connector HOC (equivalent to redux connect)

const DatabaseConnect = WrappedComponent => class extends Component {
	static contextTypes = {
        databaseActions: React.PropTypes.object,
    };

    render() {
        return <WrappedComponent {...this.props} databaseActions={this.context.databaseActions} />;
    }
}

module.exports = {
	DatabaseProvider,
	DatabaseConnect,
	copyReducer,
	copyActions: { updateLastSeq, upsertCopy },
}







