"use strict";

const LAST_OPEN_COOKIE = "last-open";
const lists = [];
const files = {};
let fileList = null;
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

async function save() {
	__edited = false;
	activeList.lastmodified = new Date();
	await fs.save(activeList);
	view.setEdited(false);
	view.setHint("saved");
}

async function openFile(filename, create=false) {
	let data, errors;
	view.toggleLoader();
	if(fileList.includes(filename)) {
		data = await loadFile(filename);
	} else if(create) {
		data =  new List("title", [], filename, new Date());
		await fs.create(data);
		fileList.push(filename);
		files[filename] = data;
	}
	if(data == null) {
		throw `${filename} could not be opened`;
	}
	if(activeList != data) {
		activeList = data;
		history = data.deltas.length;
		view.render();
	}
	Cookies.set(LAST_OPEN_COOKIE, filename);
	view.toggleLoader();
}

async function loadFile(filename) {
	let data, errors;
	if(files[filename]) {
		data = files[filename];
	} else {
		[data, errors] = await fs.load(filename);
	}
	files[filename] = data;
	return data;
}

async function deleteFile(filename) {
	view.toggleLoader();
	if(fileList.includes(filename)) {
		await fs.delete(filename);
		fileList.removeElement(filename);
		files[filename] = null;
		if(activeList.filename == filename) {
			activeList = null;
			view.render();
		}
	}
	view.toggleLoader();
}

async function renameFile(oldname, newname) {
	view.toggleLoader();
	let data = await loadFile(oldname);
	data.newfilename = newname;
	await fs.save(data);
	if(activeList == data) {
		view.render();
	}
	view.setHint(`renamed '${oldname}' to '${newname}'`);
	view.toggleLoader();
}

function logout() {
	fs.logout();
	activeList = null;
	view.render(false);
}

let history = 0;

function set(obj, key, value) {
	let oldvalue = obj[key];
	let delta = new Delta(obj, i => obj[key] = value, 
			i => obj[key] = oldvalue);
	if(history != activeList.deltas.length) {
		activeList.deltas.splice(history);
	}
	history = activeList.deltas.push(delta);
	delta.apply();
	setEditedFlag();
	if(obj.edited === false) {
		obj.edited = true;
	}
}

function undo() {
	if(history == 0) {
		return;
	}
	history--;
	activeList.deltas[history].undo();
	view.render();
}
function redo() {
	if(history == activeList.deltas.length) {
		return;
	}
	activeList.deltas[history].apply();
	view.render();
	history++;
}

function archiveCompleted() {
	let completed = activeList.elements.filter(e => e.status == COMPLETE);
	let incomplete = activeList.elements.filter(e => e.status == INCOMPLETE);
	for(let el of completed) {
		set(el, "status", ARCHIVED);
	}
	setEditedFlag();
	view.render();
}