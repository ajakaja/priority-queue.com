"use strict";

const URL = "https://priority-queue.com";
const INCOMPLETE = "incomplete";
const COMPLETE = "complete";
const DELETED = "deleted";
const ARCHIVED = "archived";

function toggle(status) {
	if(status == INCOMPLETE) {
		return COMPLETE;
	}
	if(status == COMPLETE) {
		return INCOMPLETE;
	}
	return null;
}

Array.prototype.move = function(item, i) {
	let index = this.indexOf(item);
	if(index == -1) {
		return null;
	}
	this.splice(index, 1);
	this.splice(i, 0, item);
	return this;
}

Array.prototype.removeElement = function(el) {
	let index = this.indexOf(el);
	if(index == -1) {
		return null;
	}
	this.splice(index, 1);
	return index;
}

function cycle(...fns) {
	let gen = function*() {
		let i = 0, l = fns.length;
		while(true) {
			yield fns[i++ % l]();
		}
	}();
	return () => gen.next();
}

function sortListByPriority(list) {
	list.sort((a, b) => {
		if(a.status == ARCHIVED) {
			if(b.status == ARCHIVED) {
				return 0;
			}
			return 1;
		} else if (b.status == ARCHIVED ){
			return -1;
		}
		return a.priority - b.priority;
	});
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min)) + min; //The maximum is exclusive and the minimum is inclusive
}

let primes = [17, 31, 43, 71, 83, 101];

function hashNines(str) {
	let hash = 0, char;
	for(let i = 0; i < str.length; i++) {
		char = str.charCodeAt(i);
		//each character cycles the range at a different speed.. ish
		hash = (hash + char * primes[i % primes.length]) % 729;
	}
	return [hash % 9, Math.floor(hash / 9) % 9, Math.floor(hash / 81)];
}

function colorScheme(str) {
	let hashes = hashNines(str);
	let r = 100 + 15 * hashes[1];
	let g = 100 + 15 * hashes[2];
	let b = 100 + 15 * hashes[0];
	let lightColor = `rgb(${r},${g},${b})`;
	let lighterColor = `rgb(${r+20},${g+20},${b+20})`;
	let darkColor = `rgb(${r-60},${g-60},${b-60})`;
	return [lightColor, darkColor, lighterColor];
}

class ListItem {
	constructor(text, priority, date, status, edited=false) {
		this.text = text;
		this.priority = Number.parseInt(priority);
		this.date = date;
		this.status = status;
		this.__edited = edited;
	}
}

class List {
	constructor(title, elements = [], filename, lastmodified, archived=[]) {
		this.title = title;
		this.elements = elements;
		this.filename = filename;
		this.lastmodified = lastmodified;
		this.newfilename = null;
		this.deltas = [];
		this.archived = archived;
	}
}

//not exactly the memory-safe or elegantly immutable way to do things -- but should get the job done
class Delta {
	constructor(apply, undo) {
		this.apply = apply;
		this.undo = undo;
	}
}
class SetDelta {
	constructor(obj, property, newvalue) {
		this.obj = obj;
		this.property = property;
		this.newvalue = newvalue;
		this.oldvalue = obj[property]

	}
	undoes(other) {
		if(other instanceof SetDelta) {
			return this.obj == other.obj &&
				this.property == other.property &&
				this.newvalue == other.oldvalue &&
				this.oldvalue == other.newvalue;
		}
		return false;
	}

	apply() {
		this.obj[this.property] = this.newvalue;
		this.obj.__edited = true;
	}
	undo() { 
		this.obj[this.property] = this.oldvalue;
		this.obj.__edited = true;
	}
}

class JoinedDelta {
	constructor() {
		this.deltas = [];
	}
	add(delta) {
		this.deltas.push(delta);
	}
	apply() {
		for(let d of this.deltas) {
			d.apply();
		}
	}
	undo() {
		for(let d of this.deltas) {
			d.undo();
		}
	}
}

const FILENAME = /^\w+\.txt$/;
const PREFIX = /^\w+$/;

function validFilename(filename) {
	if(FILENAME.test(filename)) {
		return filename;
	} else if(PREFIX.test(filename)) {
		return filename + ".txt";
	} else {
		return false;
	}
}

function isOffscreen($el) {
	let rect = $el[0].getBoundingClientRect();
	let viewHeight = Math.max(document.documentElement.clientHeight, window.innerHeight);
	return (rect.bottom < 0 || rect.top - viewHeight >= 0);
}

function sampleData(filename="todo.txt") {
	let item = new ListItem("edit this, or add new items below", 1, new Date(), INCOMPLETE);
	let data = new List("To do", [item], "todo.txt", new Date());
	return data;
};

function initializeDummyFilesystem() {
	let lists = {};
	let loggedIn = true;
	return {
		isAuthed() { return loggedIn; },
		isLoaded() { return true; },
		logout() { 
			lists = {};
			loggedIn = false;
		},
		save(data) {
			if(data.newfilename && data.filename) {
				lists[filename] = null;
				lists[newfilename] = data;
			} else {
				lists[filename] = data;
			}
			view.setHint("Offline. Not actually saving anything.", true);

		},
		delete(filename) {
			lists[filename] = null;
		},
		create(data) {
			lists[data.filename] = data; 
		},
		load(filename) {
			if(lists[filename]) { 
				return [lists[filename], null];
			} else {
				return null;
			}
		},
		list() {
			return Object.keys(lists);
		}, 
		test() {
			return true;
		}
	}
}