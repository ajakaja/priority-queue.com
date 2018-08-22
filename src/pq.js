"use strict";

const LAST_OPEN_COOKIE = "last-open";
const lists = [];
const files = {};
let fileList = null;
let activeList = null;
let fs = null;
let view;

let saving = false;

$(() => {
	if (!("content" in document.createElement("template"))) {
		alert("your browser's too old for this. sorry. I made this for personal use" + 
			" so I'm not really trying to make it work for everyone.");
		return;
	}
	fs = initializeDropbox();
	view = initView();
	if(!fs.isAuthed()) {
		view.setLoggedIn(false);
		view.render(false);
	} else {
		view.setLoggedIn(true);
		initLoggedIn();
	}
});

async function initLoggedIn() {
	if (!fs.isLoaded()) {
		setHint("Could not log in. Sorry.");
		return;
	}
	view.toggleLoader(true);
	fileList = await fs.list();
	if(fileList.length == 0) {
		let data = sampleData();
		await fs.create(data);
		fileList = [data.filename];
	}
	view.toggleLoader(false);
	let filename;
	{
		let lastOpen = Cookies.get(LAST_OPEN_COOKIE)
		let hash = getHash();
		if(hash && fileList.includes(hash)) {
			filename = hash;
		} else if(lastOpen && fileList.includes(lastOpen)) {
			filename = lastOpen;
		} else {
			filename = fileList[randInt(0, fileList.length)];
		}
	}
	await openFile(filename, false);
	startSaving();
	window.onhashchange = e => {
		let filename = getHash();
		if(filename && activeList && activeList.filename != filename && fileList.includes(filename)) {
			openFile(filename, false);
		}
	};
	$(window).on("beforeunload", e => {
		if(__edited) {
			return "Do you want to save first?";
		} else {
			return undefined;
		}
	});
}

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
	if(deltasSinceSave != 0) {
		view.setEdited(true);
		__edited = true;
		lastEdit = Date.now();
	} else {
		view.setEdited(false);
		__edited = false;
	}

}

function startSaving() {
	window.setInterval(() => {
		let now = Date.now();
		if(__edited && now - lastEdit > 5000 && !view.isEditing()) {
			save();
		}
	}, 1000);
}

async function save() {
	saving = true;
	view.toggleSaving();
	__edited = false;
	activeList.lastmodified = new Date();
	await fs.save(activeList);
	deltasSinceSave = 0;
	view.setEdited(false);
	view.toggleSaving();
}

async function openFile(filename, create=false) {
	let data, errors;
	view.toggleLoader(true);
	if(__edited) {
		save();
	}
	if(fileList.includes(filename)) {
		data = await loadFile(filename);
	} else if(create) {
		data =  new List([], filename);
		await fs.create(data);
		fileList.push(filename);
		files[filename] = data;
	}
	if(data == null) {
		view.toggleLoader(false);
		throw `${filename} could not be opened`;
	}
	if(activeList != data) {
		activeList = data;
		history = data.deltas.length;
		view.render();
		Cookies.set(LAST_OPEN_COOKIE, filename, { expires: 60*60*24*30 });
	}
	view.toggleLoader(false);
}

async function loadFile(filename) {
	let data, errors;
	if(files[filename]) {
		data = files[filename];
	} else {
		[data, errors] = await fs.load(filename);
	}
	if(errors && errors.length > 0) {
		view.setHint(`${errors.length} errors while loading file.`);
		for(let err of errors) {
			console.log(err);
		}
	}
	files[filename] = data;
	return data;
}

async function deleteFile(filename) {
	view.toggleLoader(true);
	if(fileList.includes(filename)) {
		await fs.delete(filename);
		fileList.removeElement(filename);
		files[filename] = null;
		if(activeList.filename == filename) {
			activeList = null;
			view.render();
		}
	}
	view.toggleLoader(false);
}

async function renameFile(oldname, newname) {
	view.toggleLoader(true);
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
		Cookies.set(LAST_OPEN_COOKIE, filename, { expires: 60*60*24*30 });
	}
	view.setHint(`renamed '${oldname}' to '${newname}'`);
	view.toggleLoader(false);
}

function logout() {
	if(__edited) {
		save();
	}
	fs.logout();
	window.location.hash = "";
	activeList = null;
	view.setLoggedIn(false);
	view.render(false);
}

let history = 0;
let sequence = null;
let deltasSinceSave = 0;

function set(obj, key, value) {
	let oldvalue = obj[key];
	let delta = new SetDelta(obj, key, value, oldvalue);
	if(sequence) {
		sequence.add(delta);
	} else {
		apply(delta);
	}
}

function startSequence() {
	sequence = new JoinedDelta();
}
function endSequence() {
	let delta = sequence;
	sequence = null;
	apply(delta);
}

function apply(delta) {
	if(history != activeList.deltas.length) {
		activeList.deltas.splice(history);
	}
	if(deltasSinceSave < 0) {
		deltasSinceSave = NaN;
	}
	if(delta.undoes && activeList.deltas.length > 0) {
		//if we toggle a value and then toggle it back, just undo the first one. saves us a lot of saves.
		if(delta.undoes(activeList.deltas[history - 1])) {
			undo();
			view.setHint("(undone)");
			return;
		}
	} 
	history = activeList.deltas.push(delta);
	delta.apply();
	deltasSinceSave++;
	setEditedFlag();
	if(history.length > 200) {
		history = 100;
		activeList.deltas.splice(history);
	}
}

function undo() {
	if(sequence != null) {
		throw "Undo failed";
	}
	if(history == 0) {
		return;
	}
	history--;
	activeList.deltas[history].undo();
	//if we go below zero, we can redo back to where we were, but if we do something else we set to NaN to stop.
	deltasSinceSave--;
	setEditedFlag();
	view.update();
}
function redo() {
	if(sequence != null) {
		throw "Redo failed";
	}
	if(history == activeList.deltas.length) {
		return;
	}
	activeList.deltas[history].apply();
	setEditedFlag();
	history++;
	deltasSinceSave++;
	view.update();
}

function archiveCompleted() {
	startSequence();
	let completed = activeList.elements.filter(e => e.status == COMPLETE);
	for(let el of completed) {
		set(el, "status", ARCHIVED);
	}
	endSequence();
	view.update();
}