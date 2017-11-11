"use strict";

const URL = "https://priority-queue.com";
const INCOMPLETE = "incomplete";
const COMPLETE = "complete";

Array.prototype.remove = function(item) {
	if(this.length == 0) {
		return null;
	}
	let i = this.indexOf(item);
	if(i == -1) {
		return null;
	}
	this.splice(i, 1);
	return item;
}

Array.prototype.move = function(item, i) {
	if(!this.remove(item)) {
		return null;
	}
	this.splice(i, 0, item);
	return this;
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


class ListItem {
	constructor(text, priority, date, status, lastmodified = null, comment = null, newfilename = null) {
		this.text = text;
		this.priority = Number.parseInt(priority);
		this.date = date;
		this.status = status;
		this.comment = comment;
		this.lastmodified= lastmodified;
	}
}

class List {
	constructor(title, elements = [], filename, comments = []) {
		this.title = title;
		this.elements = elements;
		this.filename = filename;
		this.comments = comments; //at end of file
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