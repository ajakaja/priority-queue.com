"use strict";

function initializeDropbox() {
	const CLIENT_ID = "oh0zj30oa52f1y3";
	const TOKEN_COOKIE = "dropbox-token";

	function getToken() {
		if(token != null) {
			return token;
		}
		let cookie = Cookies.get(TOKEN_COOKIE);
		if(cookie) {
			window.history.replaceState({}, document.title, window.location.origin);
			return cookie;
		}
		let params = new URLSearchParams(window.location.hash.slice(1));
		let ret = params.get("access_token");
		if(!!ret) {
			Cookies.set(TOKEN_COOKIE, ret, { expires: 60*60*24*30 });
			window.history.replaceState({}, document.title, window.location.origin);
		}
		return ret;
	}

	function isAuthenticated() {
		if(token != null) {
			return true;
		}
		return !!getToken();
	}

	let dbx;
	let authenticated = false;
	let token = null;

	if(isAuthenticated()) {
		token = getToken();
		authenticated = true;
		dbx = new Dropbox.Dropbox({ accessToken: token });
	}

	function toISOwithoutMillis(date) {
		const s = date.toISOString();
		return s.substring(0, s.indexOf(".")) + "Z";
	}

	return {
		isAuthed() { return authenticated; },
		isLoaded() { return !!dbx; },
		getAuthLink() {
			let redirectUrl;
			if(window.location.href.includes("localhost")) {
				redirectUrl = window.location.origin;
			} else {
				redirectUrl = URL;
			}
			return `https://www.dropbox.com/1/oauth2/authorize?client_id=${CLIENT_ID}`
				+ `&response_type=token&redirect_uri=${redirectUrl}`;
		},
		async logout() {
			Cookies.expire(TOKEN_COOKIE);
			authenticated = false;
			token = null;
			await dbx.authTokenRevoke();
			if(window.location.href.includes("access_token")) {
				if(window.location.href.includes("localhost")) {
					redirectUrl = window.location.origin;
				} else {
					redirectUrl = URL;
				}
				window.location = redirectUrl;
			}
		},
		async save(data) {
			if(data.newfilename && data.filename) {
				let oldfilename = data.filename;
				data.filename = data.newfilename;
				let response = await dbx.filesMove({
					from_path: "/" + oldfilename,
					to_path: "/" + data.filename,
				});
			}
			let text = parser.serialize(data);
			console.log("Saving data in " + data.filename);
			let response = await dbx.filesUpload({path: "/" + data.filename, 
					contents: text, 
					mode: "overwrite"});
			view.setHint("saved");
		},
		async delete(filename) {
			console.log(`Deleting file: '${filename}'.`);
			await dbx.filesDelete({path: "/" + filename});
		},
		async create(data) {
			let text = parser.serialize(data);
			console.log(`creating new file called '${data.filename}'.`);
			let response = await dbx.filesUpload({path: "/" + data.filename,
				contents: text
			});
		},
		async load(filename) {
			let response = await dbx.filesDownload({path: "/" + filename});
			let blob = response.fileBlob;
			var reader = new FileReader();

			let promise = new Promise((resolve, reject) => {
			    reader.addEventListener("loadend", () => {
			    	resolve(reader.result);
			    });
			});
			reader.readAsText(blob);
			let text = await promise;
			let [data, errors] = parser.deserialize(text);
			data.filename = filename;
			return [data, errors];
		},
		async list() {
			let response = await dbx.filesListFolder({path: ''});
			let entries = response.entries.filter((e) => {
				return e[".tag"] == "file";
			}).map((e) => {
				return e.name;
			});
			return entries;
		},
		async test() {
			try {
				let response = await dbx.usersGetCurrentAccount();
				return true;
			} catch (e) {
				return false;
			}
		}
	};
}
let parser = (() => {
	const ARCHIVE_HEADER = /^Archived:$/;
	const PRIORITY = /(-?[0-9]+)\./.source;
	const ITEM = /\s?(.+)/.source;
	const TITLE = /^(.+)$/;
	const ENTRY_INCOMPLETE = new RegExp("^" + PRIORITY + ITEM + "$");
	const ENTRY_COMPLETE = new RegExp(/^X\s*/.source + PRIORITY + ITEM + "$");
	const BLANK = /^\s*$/;
	const ENTRY_ARCHIVE = new RegExp(/^\*\s/.source + ITEM + "$");

	function sortListByPriority(list) {
		list.sort((a, b) => {
			if (a.status == ARCHIVED) {
				if (b.status == ARCHIVED) {
					return 0;
				}
				return 1;
			} else if (b.status == ARCHIVED) {
				return -1;
			}
			return a.priority - b.priority;
		});
	}

	return {
		serialize(list) {
			sortListByPriority(list.elements);
			let ret = "";
			for(let el of list.elements) {
				if(el.status == DELETED || el.status == ARCHIVED) {
					continue;
				}
				if(!el.__edited && el.__cached && false) {
					ret += el.__cached + "\n";
				} else {
					switch(el.status) {
						case INCOMPLETE:
						ret += `${el.priority}. ${el.text}\n`;
						break;
						case COMPLETE:
						ret += `X ${el.priority}. ${el.text}\n`;
						break;
						default:
						break;
					}
				}
			}
			let archived = list.elements.filter(e => e.status == ARCHIVED);
			if(archived.length > 0) {
				ret += "\nArchived:\n";
				for(let el of archived) {
					ret += `* ${el.text}\n`;
				}
			}
			return ret;
		},
		deserialize(text, lastmodified) {
			let errors = [];
			let data = new List();

			let lines = text.split(/\n/);
			if(lines.length == 0) {
				errors.push("File is empty.");
				return [null, errors];
			}

			let title = lines[0];
			let firstLine = 1;
			if (!ENTRY_INCOMPLETE.test(title) && !ENTRY_COMPLETE.test(title)) {

			} else if (BLANK.test(title)) {
				errors.push(`Title is blank.`);
			} else {
				firstLine = 0;
			}

			let i = firstLine;
			let archive = false

			while(true) {
				if(i >= lines.length) {
					break;
				}
				let line = lines[i];
				let entry = null;
				if(BLANK.test(line)) {
				} else if(ARCHIVE_HEADER.test(line)) {
					archive = true;
				}
				else if(ENTRY_INCOMPLETE.test(line)) {
					let [_, priority, text, age] = line.match(ENTRY_INCOMPLETE);
					entry = new ListItem(text.trim(), priority, INCOMPLETE);
				} else if(ENTRY_COMPLETE.test(line)) {
					let [_, priority, text, age] = line.match(ENTRY_COMPLETE);
					entry = new ListItem(text.trim(), priority, COMPLETE);
				} else {
					errors.push(`Could not make sense of line #${i}: '${line}'.`);
				}
				if(entry) {
					entry.__cached = line;
					data.elements.push(entry);
				}
				i++;
				if(archive) {
					break;
				}
			}
			if(archive) {
				while(true) {
					if(i >= lines.length) {
						break;
					}
					let line = lines[i];
					let entry = null;
					if(BLANK.test(line)) {
					} else if(ENTRY_ARCHIVE.test(line)) {
						let [_, text, age] = line.match(ENTRY_ARCHIVE);
						entry = new ListItem(text.trim(), null, ARCHIVED);
						entry.__cached = line;
						data.elements.push(entry);
					} else {
						errors.push(`Could not make sense of archive line #${i}: '${line}'.`);
					}
					i++;
				}
			}

			return [data, errors];
		}
	}
})();
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
		alert("your browser's too old for this. sorry. I made this for personal use"
			+ " so I'm not really trying to make it work for everyone.");
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
	constructor(text, priority, status) {
		this.text = text;
		this.priority = Number.parseInt(priority);
		this.status = status;
		this.__edited = false;
	}
}

class List {
	constructor(elements = [], filename) {
		this.title = filename;
		this.elements = elements;
		this.filename = filename;
		this.newfilename = null;
		this.deltas = [];
	}
}

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
	let data = new List([item], "todo.txt", new Date());
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
"use strict";

function initView() {

	const ENTER = 13;
	const DELETE = 8;
	const UP = 38;
	const DOWN = 40;
	const ESCAPE = 27;
	const SPACE = 32;
	const Z = 90;
	const S = 83;

	const hints = {};
	const NEWTEXT = "new task...";

	const holdTime = 600;
	var holdStart;

	var $dragging = null;
	var $dragClone = null;

	const $ul = $("#activelist");
	const $save = $("#save");
	const $loader = $("#loading");
	const $filename = $("#filename");
	const $addButton = $("#additem");
	const $newfile = $("#newfile");
	const $modal = $("#modal");
	const rowtemplate = $("#rowtemplate").get()[0];
	const filetemplate = $("#filetemplate").get()[0];
	const $trash = $("#trash");
	const $files = $("#files");
	const $filemenu = $("#filemenu");
	const $settings = $("#settings");

	let colors = false;
	const DEFAULT_COLORS = ["#9cc", "#699", "#acc"];
	const COLOR_COOKIE = "colors";

	const MODAL_DBX = "MODAL_DBX";
	const MODAL_ABOUT = "MODAL_ABOUT";
	const MODAL_HOTKEYS = "MODAL_HOTKEYS";

	let toggleLoader = (toggle) => $loader.toggleClass("hidden", !toggle);

	(function setupModal() {
		$("#dropbox-auth").attr("href", fs.getAuthLink());

		$modal.click(e => {
			if($(e.target).is($modal)) {
				if(!fs.isAuthed()) {
					fs = initializeDummyFilesystem();
					initLoggedIn();
					setHint("Offline. Not actually saving anything.");
				} else {
				}
				toggleModal(false);

			}

		});
		$("#intro-more").click(e => {
			$("#modal-dropbox").addClass("hidden");
			$("#modal-about").removeClass("hidden");
			return false;
		});
		$(".modal-back").click(e => {
			if(fs.isAuthed()) {
				toggleModal(false);
			} else {
				$("#modal-dropbox").removeClass("hidden");
				$("#modal-about").addClass("hidden");
			}
			return false;
		});
		$("#dummy-login").click(e => {
			fs = initializeDummyFilesystem();
			toggleModal(false);
			initLoggedIn();
			setHint("Offline. Not actually saving anything.");
		});
	})();

	function addItem(priority, $location) {
		const item = new ListItem(NEWTEXT, priority, new Date(), DELETED);
		activeList.elements.push(item);
		set(item, "status", INCOMPLETE);
		let $li = createPQItem(item);
		$location.before($li);
		setAsEditing($li);
	}

	function setupList() {
		$addButton.click(() => {
			let lastPriority;
			let $last = $("li.pqitem").last();
			if($last.length > 0) {
				lastPriority = getPriority($last) + 1;
			} else {
				lastPriority = 1;
			}
			addItem(lastPriority, $addButton);
		});

		setupDrag();
		setupHotkeys();

		$(document).mousedown(e => {
			setAsEditing(null);
			setSelection(null);
			$(".open").removeClass("open");
		});
	}

	function setupTitleBar() {
		$save.click(save);
		$newfile.keydown(e => {
			if(e.which == ENTER) {
				let validname = validFilename($newfile.text());
				if(!!validname) {
					let $li = createFileItem(validname);
					$li.appendTo($files);
					$newfile.text("");
					$filemenu.removeClass("open");
					openFile(validname, true);
				} else {
					setHint("filenames must be alphanumeric + .txt");
					$newfile.text("");
				}
				e.preventDefault();
			}
			e.stopPropagation();
		}).mousedown(e => {
			if(e.button != 0) {
				$filemenu.addClass("open");
				return false;
			}
		});
		$filename.mousedown(e => {
			$(".open").removeClass("open");
			$filemenu.toggleClass("open");
			return false;
		});

		$("#settingsmenu").hover(e => {
			$(".open").removeClass("open");
			$("#settings").addClass("open");
		}, e => {
			$("#settings").removeClass("open");
		});
		$("#settingsbutton").mousedown(e => {
			if(e.button != 0) {
				return false;
			}
			$(".open").removeClass("open");
			$("#settings").toggleClass("open");
			return false;
		});
		createMenuButton("#logout", logout);
		createMenuButton("#login", () => toggleModal(true, MODAL_DBX));
		createMenuButton("#archive", archiveCompleted);
		createMenuButton("#colorize", enableColors);
		createMenuButton("#decolorize", disableColors);
		createMenuButton("#about", () => {
			$("#settings").removeClass("open");
			toggleModal(true, MODAL_ABOUT);
		});
		createMenuButton("#hotkeys", () => {
			$(".open").removeClass("open");
			$("#modal-hotkeys").removeClass("hidden");
			toggleModal(true, MODAL_HOTKEYS);
		})
		if(Cookies.get(COLOR_COOKIE) == "true") {
			colors = true;
		}
	}

	function createMenuButton(id, fn) {
		$(id).mousedown(e => {
			if(e.button != 0) {
				return false;
			}
			fn();
		});
	}

	function enableColors() {
		colors = true;
		renderName();
		Cookies.set(COLOR_COOKIE, "true", { expires: 60*60*24*30 });
	}
	function disableColors() {
		colors = false;
		renderName();
		Cookies.set(COLOR_COOKIE, "false", { expires: 60*60*24*30 });
	}

	function toggleModal(bool, which) {
		if(bool) {
			$("#modal-dropbox").addClass("hidden");
			$("#modal-about").addClass("hidden");
			$("#modal-hotkeys").addClass("hidden");
			if(which == MODAL_ABOUT) {
				$("#modal-about").removeClass("hidden")
			} else if (which == MODAL_DBX) {
				$("#modal-dropbox").removeClass("hidden");
			} else if (which == MODAL_HOTKEYS) {
				$("#modal-hotkeys").removeClass("hidden");
			} else {
				console.log("Error");
			}
			$modal.removeClass("hidden");
		} else {
			$modal.addClass("hidden");

		}
	}

	function createFileItem(filename) {
		const $clone = $(document.importNode(filetemplate.content, true));
		let $li = $clone.find("li.fileitem");
		setText($li, filename);
		if(colors) {
			$li.css("background-color", colorScheme(filename)[0]);
		}
		$li.data("filename", filename);
		$li.find("div.text").keydown(e => {
			if(e.which == ENTER) {
				//rename instead of create new
				//don't rename to a duplicate filename / one that already exists
				let newname = validFilename(getText($li));
				let oldname = $li.data("filename");
				if(!!newname) {
					removeEditing($li);
					setText($li, newname);
					renameFile(oldname, newname).then(() => {
						$li.data(filename, newname);
						$filemenu.removeClass("open");
					});
				} else {
					setHint("filenames must be alphanumeric + .txt");
				}
				e.preventDefault();
			}
			e.stopPropagation();
		});
		$li.mousedown(e => {
			if(e.button != 0) {
				$filemenu.addClass("open");
				return false;
			}
			openFile(getText($li));
			$filemenu.removeClass("open");
			return false;
		});
		$li.find("div.edit").mousedown(e => {
			setAsEditing($li);
			$filemenu.addClass("open");
			return false
		});
		let $delete = $li.find("div.delete"),
			$cancel = $li.find("div.cancel"),
			$confirm = $li.find("div.confirm");
		$delete.mousedown(e => {
			$confirm.removeClass("hidden");	
			$cancel.removeClass("hidden");		
			$delete.addClass("hidden");
			setSelection($li);
			return false;
		});
		$confirm.mousedown(e => {
			let text = getText($li);
			$li.detach();
			deleteFile(text);
			return false;
		});
		$cancel.mousedown(e => {
			$confirm.addClass("hidden");	
			$cancel.addClass("hidden");		
			$delete.removeClass("hidden");
			return false;
		});
		return $li;
	}

	function toTitle(filename) {
		return filename.split(".")[0];
	}
	function renderName() {
		if(colors) {
			setColors(activeList.filename);
		} else {
			setColors(null);
		}
		if(activeList.filename) {
			$filename.text(toTitle(activeList.filename));
			$filename.addClass("shown");
		}
		$("li.fileitem").remove();
		fileList.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
		for(let i of fileList) {
			createFileItem(i).appendTo($files);
		}
		$save.addClass("shown");
	}
	function unrenderList() {
		$("li.pqitem").remove();
		$filename.text("");
		if(colors) {
			setColors(false);
		}
	}

	function unrenderFiles() {
		$("li.fileitem").remove();
	}

	function renderList() {
		$filename.text(activeList.filename);
		$("li.pqitem").remove();
		activeList.elements
			.filter(e => e.status != ARCHIVED && e.status != DELETED)
			.forEach(li => $addButton.before(createPQItem(li)));
	}
	function rerenderList() {
		let $lis = $("li.pqitem");
		let statuses = [COMPLETE, INCOMPLETE];

		let changedPriority = false;
		$lis.each((i, li) => {
			let $li = $(li);
			let item = $li.data("item");
			if(item.__edited) {
				$li.find("div.text").html(item.text);
				changedPriority = (getPriorityText($li) != priorityText(item.priority));
				if(changedPriority || !$li.hasClass(item.status)) {
					renderStatus($li, item.status);
					renderPriority($li, item.status, item.priority);
				}
			}
		});
		if(changedPriority) {
			$lis = $lis.sort( (a, b) => getPriority($(a)) - getPriority($(b)))
		}
		$lis.detach()
			.filter((i, e) => statuses.includes(getStatus($(e))))
			.insertBefore($addButton);
	}
	

	function createPQItem(item) {
		const $clone = $(document.importNode(rowtemplate.content, true));
		let $li = $clone.find("li.pqitem");
		$li.data("item", item);
		let $text = $li.find("div.text");
		$li.find("div.text").html(item.text)
			.keydown(editHandler);
		renderStatus($li, item.status);
		renderPriority($li, item.status, item.priority);

		$li.mousedown(mousedownHandler)
			.mouseup(mouseupHandler)
			.click(() => false);
		$li.on("dragstart", dragstartHandler) //fired when this $li starts dragging
		   	.on("dragover", dragoverHandler) //fired when anything else is dragging over this $li
		   	.on("dragleave", e => e.preventDefault()) //have to prevent default to allow dropping.
			.on("dragenter", dragenterHandler);//fired by the element we drag OVER
		return $li;
	} 

	function editHandler(e) {
		if(e.which == ENTER) {
			if(!e.shiftKey) {
				removeEditing($(this).closest("li.pqitem"));
				e.preventDefault();
			}
			e.stopPropagation();
		}
		if(e.which == ESCAPE) {
			e.preventDefault();
		}
	}

	function mousedownHandler(e) {
		let $target = $(e.target);
		let $this = $(this);
		if(e.button != 0) {
			return;
		}
		if($target.is("div.edit")) {
			setAsEditing($this);
			return false;
		}
		if($target.is("div.check")) {
			let data = $this.data("item");
			setStatus($this, toggle(data.status));
			return false;
		}
		if($target.is("div.close")) {
			remove($this);
			return false;
		}
		if($target.is("div.urgent")) {
			let $first = $("li.pqitem").first();
			if(!$this.is($first)) {
				resetPriorities();
				$this.detach().insertBefore($first);
			}
			return false;
		}
		if($target.is("div.add")) {
			let priority = getPriority($this);
			let $next = $this.next();
			addItem(priority+0.5, $next);
			resetPriorities();
			return false;
		}

		holdStart = Date.now();
		let time = holdStart;
		//if we hold for more than holdTime, set as editing.
		window.setTimeout(() => {
			if(holdStart == time) { //if no one has changed holdStart
				setAsEditing($this);
			}
		}, holdTime);
	 	if(hints.selection) {
			setHint("(click and hold to edit)", false);
		}
		e.stopPropagation();
	}

	function mouseupHandler(e) {
		let now = Date.now();
		let $this = $(this);
		if(e.button != 0) {
			return;
		}
		if(now - holdStart < holdTime) {
			if($this.hasClass("editing")) {
				e.stopPropagation();
				return;
			} else {
				if(e.shiftKey) {
					setSelection($this);
				} else {
					let data = $this.data("item");
					setStatus($this, toggle(data.status));
				}
			}
		}
		holdStart = null;
		return false;
	}

	function dragstartHandler(e) {
		let $target = $(e.target);
		if(!$target.is($("li.pqitem"))) {
			return false;
		}
		$target.addClass("dragging");
		holdStart = null;
		$dragging = $(e.target);
		$dragClone = $dragging.clone();
		let dt = e.originalEvent.dataTransfer;
		dt.effectAllowed = "move";
		dt.dropEffect = "move";
		window.setTimeout(() => {
			$trash.addClass("shown"); //can't reflow while dragging
		}, 10);
	}

	function dragoverHandler(e) {
		e.preventDefault();
		let $target = $(e.target).closest("li.pqitem");
		if(!$target.length) {
			return;
		}
		if(!$target.is($dragging)) {
			const mid = $target.offset().top + $target.height()/2;
			const mouseY = e.clientY;
			if(mouseY > mid && $target.prev().is($dragClone)) {
				$dragClone.detach();
				$target.after($dragClone);
				setPriority($dragClone, getPriority($target) + 1);
			} else if(mouseY <= mid && $target.next().is($dragClone)) {
				$dragClone.detach();
				$target.before($dragClone);
				setPriority($dragClone, getPriority($target) - 1);
			}
		}
	}

	function dragenterHandler(e) {
		e.preventDefault(); //have to prevent default to allow dropping.
		let $target = $(e.target).closest("li.pqitem");
		if(!$target.length) {
			return;
		}
		$dragClone.detach();
		if(!$target.is($dragging)) {
			const mid = $target.offset.top + $target.height/2;
			const mouseY = e.clientY;
			if(mouseY > mid) {
				if(!$target.next().is($dragging)) {
					$target.after($dragClone);
					$dragging.detach();
					setPriority($dragClone, getPriority($target) + 1);
				}
			} else {
				if(!$target.prev().is($dragging)) {
					$target.before($dragClone);
					$dragging.detach();
					setPriority($dragClone, getPriority($target) - 1);
				}
			}
		}
	}

	function setupDrag() {
		let inside = (x, y, $e) => {
			let o = $e.offset();
			return x >= o.left &&
				x <= o.left + $e.width() &&
				y >= o.top &&
				y <= o.top + $e.height();
		}
		$trash.on("dragenter", e => {
			e.preventDefault();
			if(inside(e.clientX, e.clientY, $trash)) {
				$trash.addClass("hover");
			}
		}).on("dragover", e => {
			e.preventDefault();
		}).on("dragleave", e => {
			e.preventDefault();
			if(!inside(e.clientX, e.clientY, $trash)) {
				$trash.removeClass("hover");
			}
		});
		$addButton.on("dragenter dragover", e => {
			if(!$addButton.prev().is($dragClone)) {
				let $prev = $addButton.prev("li.pqitem");
				if($prev.length && !$prev.is($dragging)) {
					$dragClone.detach();
					$addButton.before($dragClone);
					setPriority($dragClone, getPriority($prev) + 1);
				}
			}
		});
		$(document)
			.on("dragover", e => {e.preventDefault(); })
			.on("dragenter", e => {e.preventDefault(); })
			.on("drop", e => {
			e.preventDefault();
			if(inside(e.clientX, e.clientY, $trash)) {
				remove($dragging);
				$dragClone.remove();
			} else if($dragClone) {
				if($dragClone.parent().length > 0) {
					$dragging.detach();
					$dragClone.before($dragging);
					$dragClone.detach();
					resetPriorities();
				}
				$dragging.removeClass("dragging");
				$dragClone.remove();
			}
			$dragging = null;
			$dragClone = null;
			$trash.removeClass("shown").removeClass("hover");
		});
	}

	function resetPriorities() {
		startSequence();
		$("li.pqitem").each((i, e) => {
			let $e = $(e);
			if(getPriority($e) != i+1) {
				setPriority($e, i+1);
				highlight($e);
			}
		});
		endSequence();
	}

	function setupHotkeys() {
		$(document).keydown(e => {
			let $selection = $("li.selected");
			let hasSelection = ($selection.length != 0);
			switch (e.which) {
				case UP:
					if (!hasSelection) {
						setSelection($ul.find("li.pqitem").last());
					} else {
						let $prev = $selection.prev("li.pqitem");
						if(e.metaKey) {
							swap($selection, $prev);
						} else {
							setSelection($prev);
						}
					}
					e.preventDefault();
					break;
				case DOWN:
					if (!hasSelection) {
						setSelection($ul.find("li.pqitem").first());
					} else {
						let $next = $selection.next("li.pqitem");
						if(e.metaKey) {
							swap($selection, $next);
						} else {
							setSelection($next);
						}
					}
					e.preventDefault();
					break;
				case ENTER:
					if (hasSelection && !$selection.hasClass("editing")) {
						let priority = getPriority($selection) + 0.5;
						let $next = $selection.next();
						addItem(priority, $next);
					}
					e.preventDefault();
					break;
				case SPACE:
					if (hasSelection) {
						let status = getStatus($selection);
						if (status == INCOMPLETE) {
							setStatus($selection, COMPLETE);
						} else if (status == COMPLETE) {
							setStatus($selection, INCOMPLETE);
						}
					}
					e.preventDefault();
					break;
				case DELETE:
					if (hasSelection && !$selection.hasClass("editing")) {
						remove($selection);
					}
					e.preventDefault();
					break;
				case ESCAPE:
					if (hasSelection) {
						if($selection.hasClass("editing")) {
							if(getText($selection) == NEWTEXT) {
								remove($selection);
							} else {
								removeEditing($selection);
							}
						} else {
							setSelection(null);
						}
					}
					break;
				case Z:
					if(e.metaKey || e.ctrlKey) {
						if(e.shiftKey) {
							redo();
						} else {
							undo();
						}
						return false;
					}
					break;
				case S:
					if(e.metaKey || e.ctrlKey) {
						save();
						return false;
					}
				break;
			}
		});
	}

	function setColors(str) {
		let colors;
		if(str) {
			colors = colorScheme(str);
			$("#colorize").addClass("hidden");
			$("#decolorize").removeClass("hidden");
		} else {
			colors = DEFAULT_COLORS; 
			$("#decolorize").addClass("hidden");
			$("#colorize").removeClass("hidden");
		}
		$("body").css("background-color", colors[0]);
		$("#titlebar").css("background-color", colors[1]);
		$("#fileselector").css("background-color", colors[2]);
	}

	function swap($a, $b) {
		let pA = getPriority($a);
		let pB = getPriority($b);
		startSequence();
		setPriority($a, pB);
		setPriority($b, pA);
		endSequence();
		let $tmp = $('<span>').hide();
		$a.before($tmp);
		$b.before($a);
		$tmp.replaceWith($b);
		highlight($a);
		highlight($b);
	}

	function setAsEditing($li) {
		$(".editing").each((i, e) => {
			let $e = $(e)
			if(!$e.is($li)) {
				removeEditing($e);
			}
		});
		if($li && !$li.hasClass("editing")) {
			const $text = $li.children(".text");
			$text.attr("contenteditable", "true");
			setSelection($li);
			$li.addClass("editing");
			selectText($text);
		}
	}

	function renderStatus($li, status) {
		if(status == COMPLETE) {
			$li.removeClass(INCOMPLETE);
			$li.addClass(COMPLETE);
		} else if(status == INCOMPLETE) {
			$li.removeClass(COMPLETE);
			$li.addClass(INCOMPLETE);
		}
	}

	function renderPriority($li, status, priority) {
		$li.find(".pqpriority").text(priorityText(status, priority));
	}

	function priorityText(status, priority) {
		return (status == COMPLETE) ? "✔" : priority;
	}
	function setStatus($li, status) {
		let item = $li.data("item");
		if(item.status != status) {
			set(item, "status", status);
		}
		renderStatus($li, status);
		renderPriority($li, status, item.priority);
	}
	function removeEditing($li) {
		$li.removeClass("editing");
		window.getSelection().removeAllRanges();
		let $text = $li.children(".text");
		if($text.length > 0) {
			$text.attr("contenteditable", "false");
			syncText($li, $text.html());
		}
		if($li.is("[contenteditable]")) {
			$li.attr("contenteditable", "false");
		}
	}
	function syncText($li, text) {
		let item = $li.data("item");
		if(item) {
			if(item.text != text) {
				set(item, "text", text);
			}
		}
	}
	function setText($li, text) {
		let $text = $li.find("div.text");
		$text.text(text);
	}
	function highlight($el) {
		$el.addClass("highlight");
		window.setTimeout(() => {
			$el.removeClass("highlight");
		}, 1000);
	}
	function selectText($el) {
		let node = $el.get()[0];
		let range = document.createRange();
		let selection = window.getSelection();
		range.selectNodeContents(node);
		selection.removeAllRanges();
		selection.addRange(range);
	}
	function setSelection($e) {
		if($e && $e.length) {
			$e.addClass("selected");
			if(isOffscreen($e)) {
				$e[0].scrollIntoView(false);
			}
		}
		$(".selected").each((i, other) => {
			let $other = $(other);
			if(!$other.is($e)) {
				$other.removeClass("selected");
			}
		});
	}
	function getPriority($li) {
		if($li === $dragClone) {
			return getPriorityText($li);
		}
		return $li.data("item").priority;
	}
	function getPriorityText($li) {
		let text = $li.find("div.pqpriority").text();
		return text;
	}
	function getStatus($li) {
		return $li.data("item").status;
	}
	function setPriority($li, priority) {
		if($li === $dragClone) {
			renderPriority($li, null, priority);
			return
		} else {
			let item = $li.data("item");
			set(item, "priority", priority);
			renderPriority($li, item.status, priority);
		}
	}
	function getText($li) {
		return $li.find("div.text").text();
	}
	function getHtml($li) {
		return $li.find("div.text").html();
	}
	function remove($li) {
		let item = $li.data("item");
		set(item, "status", DELETED);
		$li.detach();
	}
	function setHint(text, repeat=true) {
		if(repeat || !hints[text]) {
			//add a new element that copies the existing one, to reset the animation
			//not sure if there's a better way...
			let $hint = $(".hint");
			let $hint2 = $hint.clone(false);
			$hint2.text(text);
			$hint2.css({"animation": "fadeout", 
						"animation-duration": "4s"});
			$hint.after($hint2);
			$hint.remove();
		}
		if(!repeat) {
			hints[text] = true;
		}
	}

	function setError(text) {
		setHint(text);
	}

	setupTitleBar();
	setupList();

	return {
		toggleLoader: toggleLoader,
		render(loggedIn=true) {
			if(loggedIn) {
				if(activeList) {
					renderList();
					renderName();
					window.location.hash = activeList.filename;
					document.title = activeList.filename;
				} else {
					unrenderList();
				}
			} else {
				unrenderList();
				unrenderFiles();
				toggleModal(true, MODAL_DBX);
			}
		},
		update() {
			rerenderList();
		},
		setHint(text, repeat) {
			setHint(text, repeat);
		},
		setEdited(edited) {
			if(edited) {
				$save.addClass("edited");
			} else {
				$save.removeClass("edited");
			}
		},
		isEditing() {
			return $(".editing").length > 0;
		},
		toggleSaving() {
			$save.toggleClass("saving");
		},
		setLoggedIn(loggedIn) {
			$("#login").toggleClass("hidden", loggedIn);
			$("#logout").toggleClass("hidden", !loggedIn);
		}
	}
}
(function(d,f){"use strict";var h=function(d){if("object"!==typeof d.document)throw Error("Cookies.js requires a `window` with a `document` object");var b=function(a,e,c){return 1===arguments.length?b.get(a):b.set(a,e,c)};b._document=d.document;b._cacheKeyPrefix="cookey.";b._maxExpireDate=new Date("Fri, 31 Dec 9999 23:59:59 UTC");b.defaults={path:"/",secure:!1};b.get=function(a){b._cachedDocumentCookie!==b._document.cookie&&b._renewCache();a=b._cache[b._cacheKeyPrefix+a];return a===f?f:decodeURIComponent(a)};
b.set=function(a,e,c){c=b._getExtendedOptions(c);c.expires=b._getExpiresDate(e===f?-1:c.expires);b._document.cookie=b._generateCookieString(a,e,c);return b};b.expire=function(a,e){return b.set(a,f,e)};b._getExtendedOptions=function(a){return{path:a&&a.path||b.defaults.path,domain:a&&a.domain||b.defaults.domain,expires:a&&a.expires||b.defaults.expires,secure:a&&a.secure!==f?a.secure:b.defaults.secure}};b._isValidDate=function(a){return"[object Date]"===Object.prototype.toString.call(a)&&!isNaN(a.getTime())};
b._getExpiresDate=function(a,e){e=e||new Date;"number"===typeof a?a=Infinity===a?b._maxExpireDate:new Date(e.getTime()+1E3*a):"string"===typeof a&&(a=new Date(a));if(a&&!b._isValidDate(a))throw Error("`expires` parameter cannot be converted to a valid Date instance");return a};b._generateCookieString=function(a,b,c){a=a.replace(/[^#$&+\^`|]/g,encodeURIComponent);a=a.replace(/\(/g,"%28").replace(/\)/g,"%29");b=(b+"").replace(/[^!#$&-+\--:<-\[\]-~]/g,encodeURIComponent);c=c||{};a=a+"="+b+(c.path?";path="+
c.path:"");a+=c.domain?";domain="+c.domain:"";a+=c.expires?";expires="+c.expires.toUTCString():"";return a+=c.secure?";secure":""};b._getCacheFromString=function(a){var e={};a=a?a.split("; "):[];for(var c=0;c<a.length;c++){var d=b._getKeyValuePairFromCookieString(a[c]);e[b._cacheKeyPrefix+d.key]===f&&(e[b._cacheKeyPrefix+d.key]=d.value)}return e};b._getKeyValuePairFromCookieString=function(a){var b=a.indexOf("="),b=0>b?a.length:b,c=a.substr(0,b),d;try{d=decodeURIComponent(c)}catch(k){console&&"function"===
typeof console.error&&console.error('Could not decode cookie with key "'+c+'"',k)}return{key:d,value:a.substr(b+1)}};b._renewCache=function(){b._cache=b._getCacheFromString(b._document.cookie);b._cachedDocumentCookie=b._document.cookie};b._areEnabled=function(){var a="1"===b.set("cookies.js",1).get("cookies.js");b.expire("cookies.js");return a};b.enabled=b._areEnabled();return b},g=d&&"object"===typeof d.document?h(d):h;"function"===typeof define&&define.amd?define(function(){return g}):"object"===
typeof exports?("object"===typeof module&&"object"===typeof module.exports&&(exports=module.exports=g),exports.Cookies=g):d.Cookies=g})("undefined"===typeof window?this:window);