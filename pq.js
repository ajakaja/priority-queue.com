"use strict";

const lists = [];
let fileList = null;
const files = {};
let activeList = null;
let fs = null;
let view;

var $ul;
var $save;
var $loader;

$(() => {
	$ul = $("#activelist");
	$save = $("#save");
	$loader = $("#loading");
	init()
});

async function init() {
	if (!("content" in document.createElement("template"))) {
		alert("your browser's too old for this. sorry. I made this for personal use"
			+ " so I'm not really trying to make it work for everyone.");
		return;
	}
	fs = initializeDropbox();
	view = initView();
	if(!fs.isAuthed()) {
		view.render(false);
		return;
	}
	if (!fs.isLoaded()) {
		setHint("Could not log in. Sorry.");
		return;
	}
	view.toggleLoader();
	fileList = await fs.list();
	let newb = false;
	if(fileList.length == 0) {
		let data = sampleData();
		await fs.create(data);
		fileList = [data.filename];
		newb = true;
	}
	let filename = fileList[0];
	let [data, errors] = await fs.load(filename);
	activeList = data;
	files[filename] = data;
	view.render();
	startSaving();
	view.toggleLoader();
	if(newb) {
		view.setHint("click and hold to edit", false);
	}
};

let lastEdit = null;
let __edited = false;

function setEditedFlag() {
	view.setEdited(true);
	__edited = true;
	lastEdit = Date.now();
}

function startSaving() {
	window.setInterval(() => {
		let now = Date.now();
		if(__edited && now - lastEdit > 5000) {
			save();
		}
	}, 1000);
}

function save() {
	__edited = false;
	fs.save(activeList);
	view.setEdited(false);
	view.setHint("saved");
}

async function openFile(filename, create=false) {
	let data, errors;
	if(fileList.includes(filename)) {
		if(files[filename]) {
			data = files[filename];
		} else {
			[data, errors] = await fs.load(filename);
		}
	} else if(create) {
		data =  new List("title", [], filename);
		await fs.create(data);
		fileList.push(filename);
		files[filename] = data;
	}
	if(activeList != data) {
		activeList = data;
		view.render();
	}
}

function logout() {
	fs.logout();
	activeList = null;
	view.render(false);
}