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
	view.toggleLoader();
	if(!fs.isAuthed()) {
		view.render(false);
		return;
	}
	if (!fs.isLoaded()) {
		setHint("Could not log in. Sorry.");
		return;
	}
	fileList = await fs.list();
	if(fileList.length == 0) {
		let data = sampleData();
		await fs.create(data);
		fileList = [data.filename];
		view.setHint("click and hold to edit", false);
	}
	view.toggleLoader();
	let filename;
	{
		let lastOpen = Cookies.get(LAST_OPEN_COOKIE)
		let hash = getHash();
		if(hash && fileList.includes(hash)) {
			filename = hash;
		} else if(lastOpen && fileList.includes(lastOpen)) {
			filename = lastOpen;
		} else {
			filename = fileList[0];
		}
	}
	await openFile(filename, false);
	startSaving();
	window.onhashchange = e => {
		let hash = getHash();
		if(hash && activeList.filename != hash && fileList.includes(hash)) {
			openFile(hash, false);
		}
	};
};

function getHash() {
	let hash = window.location.hash;
	if(hash && hash.length > 0) {
		return hash.substring(1);
	} else {
		return null;
	}
}

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
		if(__edited && now - lastEdit > 5000 && !view.isEditing() && !loading) {
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
		Cookies.set(LAST_OPEN_COOKIE, filename);
	}
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
	data.lastmodified = new Date();
	await fs.save(data);
	files[oldname] = null;
	files[newname] = data;
	fileList.remove(oldname);
	fileList.add(newname);
	if(activeList == data) {
		view.render();
		Cookies.set(LAST_OPEN_COOKIE, filename);
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
	for(let el of completed) {
		set(el, "status", ARCHIVED);
	}
	setEditedFlag();
	view.render();
}

function deleteCompleted() {
	let completed = activeList.elements.filter(e => e.status == COMPLETE);
	for(let el of completed) {
		set(el, "status", DELETED);
	}
	setEditedFlag();
	view.render();
}
function resetPriorities() {
	sortListByPriority(activeList.elements);
	let i = 1;
	for(let e of activeList.elements) {
		if(e.status != ARCHIVED && e.status != DELETED) {
			set(e, "priority", i);
			i++;
		}
	}
	setEditedFlag();
	view.render();
}