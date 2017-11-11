"use strict";

const LAST_OPEN_COOKIE = "last-open";
const lists = [];
let fileList = null;
const files = {};
let activeList = null;
let fs = null;
let view;

$(() => init());

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
	let lastOpen = Cookies.get(LAST_OPEN_COOKIE)
	let filename;
	if(lastOpen && fileList.includes(lastOpen)) {
		filename = lastOpen;
	} else {
		filename = fileList[0];
		Cookies.set(LAST_OPEN_COOKIE, filename);
	}
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
	activeList.lastmodified = new Date();
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
		data =  new List("title", [], filename, new Date());
		await fs.create(data);
		fileList.push(filename);
		files[filename] = data;
	}
	if(activeList != data) {
		activeList = data;
		view.render();
	}
	Cookies.set(LAST_OPEN_COOKIE, filename);
}

function logout() {
	fs.logout();
	activeList = null;
	view.render(false);
}