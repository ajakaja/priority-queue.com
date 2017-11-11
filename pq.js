function error(error){
	console.log(error);
}

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

const INCOMPLETE = "incomplete";
const COMPLETE = "complete";
const URL = "https://priority-queue.com";
const ENTER = 13;
const DELETE = 8;
const UP = 38;
const DOWN = 40;
const ESCAPE = 27;
const SPACE = 32;

class ListItem {
	constructor(text, priority, date, status, comment = "", newfilename = null) {
		this.text = text;
		this.priority = Number.parseInt(priority);
		this.date = date;
		this.status = status;
		this.comment = comment;
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
2
const lists = [];
let filelist = null;
let files = {};
let activeList = null;
let dbx = null;
let __edited = false;
let lastEdit = null;
let fs = null;
var $ul;
var $save;

const hints = {
	edit: true,
	selection: true,
	priority: true,
	filename : true
}


async function init() {
	if (!("content" in document.createElement("template"))) {
		alert("your browser's too old for this. sorry. I made this for personal use"
			+ " so I'm not really trying to make it work for everyone.");
		return;
	}
	$ul = $("#activelist");
	$save = $("#save");
	fs = initializeDropbox();
	if(!fs.isAuthed()) {
		await initModal();
	}
	if (!fs.isLoaded()) {
		console.log("Dropbox could not be found. Sorry.");
		return;
	}
	fileList = await fs.list();
	let newb = false;
	if(fileList.length == 0) {
		let item = new ListItem("edit this, or add new items below", 1, new Date(), INCOMPLETE);
		let data = new List("To do", [item], "todo.txt");
		await fs.create(data);
		fileList = [data.filename];
		newb = true;
	}
	let filename = fileList[0];
	let [data, errors] = await fs.load(filename);
	activeList = data;
	files[filename] = data;
	setupTitleBar();
	setupList();
	startSaving();
	if(newb) {
		setHint("click and hold to edit");
		hints.edit = false;
	}
};

$(() => init() )

function initModal() {
	$("#modal").css("display", "grid")
		.click((e) => {
			$("#modal").hide();
			//TODO: do something.
		});
	$("#dropbox-auth").attr("href", fs.getAuthLink());
	return new Promise((resolve, reject) => {
		//never resolves
		//TODO: click outside / cancel modal, don't log in, and work offline (?)
	});
}

function setEditedFlag() {
	if(!__edited) {
		console.log("edited=true");
	}
	$save.addClass("edited");
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
	$save.removeClass("edited");
	setHint("saved");
}

const NEWTEXT = "new task...";

function setupList() {
	const $addButton = $("#additem")
		.click(() => {
			let lastPriority;
			if(activeList.elements.length != 0) {
				lastPriority = Number.parseInt(activeList.elements[activeList.elements.length-1].priority)+1; 
			} else {
				lastPriority = 1;
			}
			const li = new ListItem(NEWTEXT, lastPriority, new Date(), INCOMPLETE)
			activeList.elements.push(li);
			let $li = toHtml(li);
			$addButton.before($li);
			setAsEditing($li);
		});

	renderList();
	setupDrag();
	setupHotkeys();

	$("body").click((e) => {
		//remove selections if we click outside the list
		if(!e.target.closest("ul")) {
			setAsEditing(null);
			setSelection(null);
			if($("#fileselector").is(":visible")) {
				$("#fileselector").css("display", "none");
			}
		}
	});
}

function setupTitleBar() {
	const $name = $("#listname");
	const $filename = $("#filename");
	renderName();
	$name.dblclick(() => {
		$name.attr("contenteditable", "true");
		select($name.get()[0]);
		$name.addClass("editing");
	}).keydown((e) => {
		if($name.hasClass("editing")) {
			if(e.which == ENTER) {
				e.preventDefault();
				e.stopPropagation();
				window.getSelection().removeAllRanges();
				$name.removeClass("editing");
				$name.attr("contenteditable", "false");
				if($name.text() != activeList.title) {
					setEditedFlag();
					activeList.title = $name.text();
				}
			}
		}
	});
	$filename.click((e) => {
		$("#fileselector").toggle();
		e.stopPropagation();
	});
/*	.dblclick(() => {
		$filename.attr("contenteditable", "true");
		select($filename.get()[0]);
		$filename.addClass("editing");
	}).keydown((e) => {
		if($filename.hasClass("editing")) {
			if(e.which == ENTER) {
				e.preventDefault();
				e.stopPropagation();
				window.getSelection().removeAllRanges();
				$filename.removeClass("editing");
				$filename.attr("contenteditable", "false");
				if($filename.text() != activeList.filename) {
					let filename = validFilename($filename.text());
					if(!filename) {
						$filename.text(activeList.filename);
						setHint("filenames must be alphanumeric + .txt");
						hints.filename = false;
					} else {
						setEditedFlag();
						activeList.newfilename = filename;
					}
				}
			}
		}
	});*/
	$("#save").click((e) => {
		save();
	});

	const $settings = $("#settings");
	$settings.click((e) => {
		logout();
	}).hover(() => {
	 	$settings.addClass("hover");
	}, () => {
		$settings.removeClass("hover");
	});

	let $fileList = $("#files");
	function createFileItem(i) {
		return $li = $("<li/>", {
			text: i,
			class: "fileitem"
		}).click((e) => {
			openFile(i).then(() => {
				console.log("loaded");
			});
			e.stopPropagation();
			e.preventDefault();
		});
	}
	for(let i of fileList) {
		createFileItem(i)
			.prependTo($fileList);
	}
	$("#newfile").click((e) => {
		e.stopPropagation();
		e.preventDefault();
		let $li = createFileItem("new file...");
		$li.attr("contenteditable", "true")
			.addClass("editing")
			.insertBefore("#newfile")
			.keydown((e) => {
				if(e.which == ENTER) {
					$li.attr("contenteditable", "false");
					$li.removeClass("editing");
					e.preventDefault();
					e.stopPropagation();
					window.getSelection().removeAllRanges();
					let name = validFilename($li.text());
					$li.text(name);
					if(!!name) {
						openFile(name, true).then(() => {
							console.log("loaded");
						});
					} else {
						setHint("filenames must be alphanumeric + .txt");
						hints.filename = false;
					}
				}
			});
		select($li.get()[0]);
	});
}

function unrenderList() {
	$("li.pqitem").remove();
}

function renderList() {
	let $addButton = $("#additem");
	activeList.elements.forEach( (li) => {
		$addButton.before(toHtml(li));
	});
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
		data = new List("title...", [], filename);
		await fs.create(data);
		fileList.push(filename);
		files[filename] = data;
	}
	activeList = data;
	unrenderList();
	$("#fileselector").hide();
	renderList();
	renderName();
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

function renderName() {
	const $name = $("#listname");
	$name.text(activeList.title);
	if(activeList.filename) {
		$("#filename").text(activeList.filename);
	}
}

function logout() {
	fs.logout();
	activeList = new List();
	renderList();
	$("#modal").toggle();
}

const holdTime = 600;
var holdStart;

function toHtml(item) {
	const template = $("#rowtemplate").get()[0];
	const $clone = $(document.importNode(template.content, true));
	let $li = $clone.find("li.pqitem");
	$li.data("item", item);
	$text = $li.find("div.pqtext");
	$text.text(item.text)
		.keydown((e) => {
			if(e.which == ENTER) {
				e.preventDefault();
				e.stopPropagation();
				removeEditing($li);
				window.getSelection().removeAllRanges();
				setSelection($li);
			}
		});
	$li.hover(() => {
			$li.addClass("hover");
		}, () => {
			$li.removeClass("hover");
		})
		.mousedown((e) => {
			holdStart = Date.now();
			let time = holdStart;
			//if we hold for more than holdTime, set as editing.
			window.setTimeout(() => {
				if(holdStart == time) { //if no one has changed holdStart
					setAsEditing($li);
				}
			}, holdTime);
		 	if(hints.selection) {
				setHint("(click and hold to edit)");
				hints.selection = false;
			}
		})
		.mouseup((e) => {
			let now = Date.now();
			if(now - holdStart < holdTime) {
				if($li.hasClass("editing")) {
					setAsEditing($li);
				} else if(item.status == INCOMPLETE) {
					setStatus($li, COMPLETE);
					setSelection($li);
				} else if(item.status == COMPLETE) {
					setStatus($li, INCOMPLETE);
					setSelection($li);
				}
			}
			holdStart = null;
			e.preventDefault();
		});
	renderStatus($li, item.status, item.priority);
	$li.find("div.pqdate")
		.text(`(${getAgeString(item.date)})`);
	$li.find("div.edit")
		.mousedown((e) => {
			setAsEditing($li);
			e.stopPropagation();
			e.preventDefault();
		});
	$li.find("div.close")
		.mousedown((e) => {
			remove($li, item);
			e.stopPropagation();
		});
	$li.find("div.check")
		.mousedown((e) => {
			if(item.status == INCOMPLETE) {
				setStatus($li, COMPLETE);
			} else if(item.status == COMPLETE) {
				setStatus($li, INCOMPLETE);
			}
			e.stopPropagation();
		});
	addDrag($li);
	return $li;
}

//a hack to work around the stupidity of the dragging API -- dragenter/dragleave/etc provide no reference to the object being dragged
var $dragging = null;
var $dragClone = null;

function addDrag($li) {
	$li.on("dragstart", (e) => {
		let $target = $(e.target);
		$target.addClass("dragging");
		holdStart = null;
		$dragging = $li;
		$dragClone = $li.clone();
		let dt = e.originalEvent.dataTransfer;
		dt.setData("text/html", $li);
		dt.effectAllowed = "move";
		dt.dropEffect = "move";
		window.setTimeout(() => {
			$("#trash").addClass("shown"); //can't reflow while dragging
		}, 10);

	}).on("dragend", (e) => {

	}).on("dragover", (e) => {
		e.preventDefault();
		let $target = $(e.originalEvent.target).closest("li.pqitem");
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
	}).on("dragleave", (e) => {
		e.preventDefault(); //have to prevent default to allow dropping.
	}).on("dragenter", (e) => {
		e.preventDefault(); //have to prevent default to allow dropping.
		//fired by the element we drag OVER
		let $target = $(e.originalEvent.target).closest("li.pqitem");
		if(!$target.is($("li.pqitem"))) { //in case events fire from children
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
	});
}

function setupDrag() {
	let $trash = $("#trash");
	$trash.on("dragenter", (e) => {
		e.preventDefault();
		let $target = $(e.originalEvent.target);
		if(!$target.is($("$trash"))) {
			return;
		}
		$target.addClass("hover");
	}).on("dragover", (e) => {
		e.preventDefault();
	}).on("dragleave", (e) => {
		e.preventDefault();
		let $target = $(e.originalEvent.target);
		if(!$target.is($("$trash"))) {
			return;
		}
		$target.removeClass("hover");
	});
	$(document)
		.on("dragover", (e) => {e.preventDefault(); })
		.on("dragenter", (e) => {e.preventDefault(); })
		.on("drop", (e) => {
		e.preventDefault();
		let $target = $(e.originalEvent.target);
		if($target.is($trash)) {
			$dragClone.remove();
			remove($dragging);
		} else if($dragClone) {
			if($dragClone.parent().length > 0) {
				$dragging.detach();
				$dragClone.before($dragging);
				$dragClone.detach();

				let index = $dragging.index() - 1; //Jquery index starts at 1
				let item = $dragging.data("item");
				activeList.elements.move(item, index);

				const priority = getPriority($dragClone);
				const oldPriority = getPriority($dragging);
				if(oldPriority != priority) { //we're not back where we started
					setEditedFlag();
					setPriority($dragging, priority);
					highlight($dragging);

					let $prev = $dragging.prev("li.pqitem");
					let prevPriority = priority;
					//propagate new numbers so we don't have any two equal
					while($prev.length != 0 && getPriority($prev) == prevPriority) {
						prevPriority--;
						setPriority($prev, prevPriority);
						highlight($prev);
						$prev = $prev.prev("li.pqitem");
					}
					let nextPriority = priority;
					let $next = $dragging.next("li.pqitem");
					while($next.length != 0 && getPriority($next) == nextPriority) {
						nextPriority++;
						setPriority($next, nextPriority);
						highlight($next);
						$next = $next.next("li.pqitem");
					}
				}	
			}
			$dragging.removeClass("dragging");
			$dragClone.remove();
		}
		$dragging = null;
		$dragClone = null;
		$trash.removeClass("shown").removeClass("hover");
	});
}

function highlight($el) {
	$el.addClass("highlight");
	window.setTimeout(() => {
		$el.removeClass("highlight");
	}, 1000);
}

function setupHotkeys() {
	$(document).keydown((e) => {
		let $selection = $("li.selected");
		let $li;
		switch (e.which) {
			case UP:
				if($selection.length == 0) {
					$li = $ul.find("li.pqitem").last();
				} else {
					$li = $selection.prev("li.pqitem");
				}
				if($li.length) {
					setSelection($li);
				}
				e.preventDefault();
				break;
			case DOWN:
				if($selection.length == 0) {
					$li = $ul.find("li.pqitem").first();
				} else {
					$li = $selection.next("li.pqitem");
				}
				if($li.length) {
					setSelection($li);
				}
				e.preventDefault();
				break;
			case ENTER:
				if($selection.length != 0) {
					let status = getStatus($selection);
					if(status == INCOMPLETE) {
						setStatus($selection, COMPLETE);
					} else if(status == COMPLETE) {
						setStatus($selection, INCOMPLETE);
					}		
				}
				break;
			case DELETE:
				if($selection.length != 0 && !$selection.hasClass("editing")) {
					remove($selection);
				}
				break;
			case ESCAPE:
				if($selection.length != 0) {
					if($selection.hasClass("editing")) {
						if(getText($selection) == NEWTEXT) {
							remove($selection);
						} else {
							$selection.removeClass("editing");
						}
					} else {
						remove($selection);
					}
				}
				break;
		}
	});
}

function adjustPriorities(start) {
	let $lis = $ul.children("li.pqitem");
	$lis.each((i, li) => {
		setPriority($(li), i+start);
	});
}

function isOffscreen($li) {
	let rect = $li[0].getBoundingClientRect();
	let viewHeight = Math.max(document.documentElement.clientHeight, window.innerHeight);
	return (rect.bottom < 0 || rect.top - viewHeight >= 0);
}


function setStatus($li, status) {
	let item = $li.data("item");
	if(item.status != status) {
		setEditedFlag();
		item.status = status;
		renderStatus($li, status, item.priority);
	}
}

function renderStatus($li, status, priority) {
	if(status == COMPLETE) {
		$li.removeClass(INCOMPLETE);
		$li.addClass(COMPLETE);
	} else if(status == INCOMPLETE) {
		$li.removeClass(COMPLETE);
		$li.addClass(INCOMPLETE);
	}
	renderPriority($li, priority, status);
}

function setAsEditing($li) {
	if($li) {
		const $text = $li.children(".pqtext");
		$text.attr("contenteditable", "true");
		setSelection($li);
		$li.addClass("editing");
		select($text.get()[0]);
	}

	$ul.children("li.pqitem").each( (i, e)=> {
		$e = $(e)
		if(!$e.is($li)) {
			let $div = $e.children(".pqtext");
			let text = $div.text();
			let item = $e.data("item");
			if(item.text != text) {
				setEditedFlag();
				item.text = text;
			}
			$div.attr("contenteditable", "false");
			$e.removeClass("editing");
		}
	});
	$("#listname").removeClass("editing");

}

function select(node) {
	let range = document.createRange();
	let selection = window.getSelection();
	range.selectNodeContents(node);
	selection.removeAllRanges();
	selection.addRange(range);
}

function removeEditing($li) {
	let $div = $li.children(".pqtext");
	$li.removeClass("editing");
	$div.attr("contenteditable", "false");
	let item = $li.data("item");
	let text = $div.text();
	if(item.text != text) {
		setEditedFlag();
		item.text = text;
	}
}

function setSelection($li) {
	if($li) {
		$li.addClass("selected");
		if(isOffscreen($li)) {
			$li[0].scrollIntoView(false);
		}
	}
	$ul.children("li").each( (i, e) => {
		$e = $(e);
		if(!$e.is($li)) {
			$e.removeClass("selected");
		}
	});
}

function setHint(text) {
	const $hint = $("#hint");
	//add a new element that copies the existing one, to reset the animation
	//not sure if there's a better way...
	$hint2 = $hint.clone(false);
	$hint.after($hint2);
	$hint.remove();
	$hint2.text(text);
	$hint2.css({"animation": "fadeout", 
				"animation-duration": "4s"});
}

function getPriority($li) {
	if($li === $dragClone) {
		return Number.parseInt($dragClone.find("div.pqpriority").text());
	}
	return $li.data("item").priority;
}
function getStatus($li) {
	return $li.data("item").status;
}
function setPriority($li, priority) {
	if($li === $dragClone) {
		renderPriority($li, priority, null);
		return
	} else {
		let item = $li.data("item");
		item.priority = priority;
		renderPriority($li, priority, item.status);
		setEditedFlag();
	}
}

function renderPriority($li, priority, status) {
	if(status == COMPLETE) {
		$li.find(".pqpriority").text("✔");
	} else {
		$li.find(".pqpriority").text(priority);
	}
}
function getText($li) {
	return $li.find("div.pqtext").text();
}

function remove($li, item) {
	if(typeof item === 'undefined') {
		item = $li.data("item");
	}
	activeList.elements = activeList.elements.filter(x => x !== item);
	$li.addClass("hiding");
	window.setTimeout(() => {
		$li.remove();
	}, 200);
	item.status = "";
	setEditedFlag();
}

function getAgeString(date, fluent=true) { //fluent: whether to make it more human-readable
	let diff = (Date.now() - date.getTime()) / 1000;
	if(diff < 0)
		return fluent ? "??" : "0s";
	if(diff < 5)
		return fluent ? "just now" : `${Math.round(diff)}s`;
	if(diff < 60)
		return `${Math.round(diff)}s`;
	if(diff < 60*60) 
		return `${Math.round(diff / 60)}m`;
	if(diff < 60*60*24*3)
		return `${Math.round(diff/(60*60))}h`;
	if(diff < 60*60*24*7*2)
		return `${Math.round(diff/(60*60*24))}d`;
	if(diff < 60*60*24*30*3)
		return `${Math.round(diff/(60*60*24*7))}w`;
	if(diff < 60*60*24*365*2)
		return `${Math.round(diff/(60*60*24*30))}mo`;
	return `${Math.round(diff/(60*60*24*365))}y`;
}

const DATE = /^([0-9]+)([a-z]+)$/;
function getDateBefore(dateString, now) {
	let [_, t, u] = dateString.match(DATE);
	let factor = 0;
	switch (u){
		case "s":
		factor = 1000;
		break;
		case "m":
		factor = 1000*60;
		break;
		case "h":
		factor = 1000*60*60;
		break;
		case "d":
		factor = 1000*60*60*24;
		break;
		case "w":
		factor = 1000*60*60*24*7;
		break;
		case "mo":
		factor = 1000*60*60*24*30;
		break;
		case "y":
		factor = 1000*60*60*24*365;
		break;
	}
	let diff = factor * t;
	return new Date(now - diff);
}


function serialize(list) {

	function getAge(date) {
		return getAgeString(date, false);
	}

	let ret = list.title + "\n";
	for(let i = 0; i < list.elements.length; i++) {
		let el = list.elements[i];
		switch(el.status) {
			case INCOMPLETE:
			ret += `${el.priority}. ${el.text} [${getAge(el.date)}]`;
			break;
			case COMPLETE:
			ret += `X ${el.priority}. ${el.text} [${getAge(el.date)}]`;
			break;
		}
		if(el.comment) {
			ret += ` //${el.comment}\n`;
		} else {
			ret += "\n";
		}
	}
	if(list.comments) {
		ret += "\n";
		for(let i = 0; i < list.comments.length; i++) {
			let el = list.comments[i];
			if(el.length > 0) {
				ret += `// ${el}\n`;
			} else {
				ret += "\n";
			}
		}
	}
	return ret;
}

const PRIORITY = /([0-9]+)\./.source;
const ITEM = /\s?(.+)/.source;
const AGE = /\s?(?:\[([0-9]+[a-z]+)\])/.source; //something of the form [5h] or [14m]
const COMMENT = /\s*(?:\/\/\s?(.*))?/.source;

const TITLE = /^(.+)$/;
const ENTRY_INCOMPLETE = new RegExp("^" + PRIORITY + ITEM + AGE + COMMENT + "$");
const ENTRY_COMPLETE = new RegExp(/^X\s*/.source + PRIORITY + ITEM + AGE + COMMENT + "$");
const COMMENT_LINE = /^\/\/\s?(.+)$/;
const BLANK = /^\s*$/;

function deserialize(text) {
	let errors = [];
	let data = new List();

	let lines = text.split(/\n/);
	if(lines.length == 0) {
		errors.push("File is empty.");
		return [null, errors];
	}

	let title = lines[0];
	let firstLine = 1;

	if(TITLE.test(title)) {
		data.title = title.match(TITLE)[1];
	} else if (BLANK.test(title)) {
		errors.push(`Title is blank.`);
	} else if (ENTRY.test(title)){
		errors.push(`No title present -- first line is '${title}'.`)
		firstLine = 0;
	}

	let firstComment = null;
	let i = firstLine;
	while(true) {
		if(i >= lines.length) {
			break;
		}
		let line = lines[i];
		let entry = null;
		let now = Date.now(); //TODO: this should be the last time the file was saved?
		if(BLANK.test(line)) {
		} else if (COMMENT_LINE.test(line)) {
			firstComment = i;
			let comment = line.match(COMMENT_LINE)[1];
			data.comments.push(comment).trim();
		} else if(ENTRY_INCOMPLETE.test(line)) {
			let [_, priority, text, age, comment] = line.match(ENTRY_INCOMPLETE);
			entry = new ListItem(text.trim(), priority, getDateBefore(age, Date.now()), INCOMPLETE, comment);
		} else if(ENTRY_COMPLETE.test(line)) {
			let [_, priority, text, age, comment] = line.match(ENTRY_COMPLETE);
			entry = new ListItem(text.trim(), priority, getDateBefore(age, Date.now()), COMPLETE, comment);
		} else {
			errors.push(`Could not make sense of line #${i}: '${line}'.`);
		}
		if(entry) {
			data.elements.push(entry);
			if(firstComment) {
				errors.push(`Line #${i} ('${line}') was an entry, but came after line #${firstComment}, which was a comment.`);
			}
		}
		i++;
	}

	return [data, errors];
}

function setupTest() {
	const li3 = new ListItem("support drag", 1, new Date(), INCOMPLETE);
	const li4 = new ListItem("priorities", 2, new Date(), INCOMPLETE);
	const li5 = new ListItem("multiple lists", 3, new Date(), INCOMPLETE);
	const li6 = new ListItem("help menu", 5, new Date(2017, 9, 1), COMPLETE);
	const list1 = new List("To-do", [li3, li4, li5, li6, li7], "test.txt", ["", "this is the format"]);
	lists.push(list1);
	activeList = list1;
}
