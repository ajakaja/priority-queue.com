function error(error){
	console.log(error);
}

const INCOMPLETE = "incomplete";
const COMPLETE = "complete";

const URL = "https://priority-queue.com";

class ListItem {
	constructor(text, priority, date, status, comment = "") {
		this.text = text;
		this.priority = priority;
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
let activeList = null;
let dbx = null;
let __edited = false;
let lastEdit = null;
let fs = null;
let rendered = false;

const hints = {
	selection: true,
	priority: true
}


async function init() {
	if (!("content" in document.createElement("template"))) {
		alert("your browser's too old for this. sorry.");
		return;
	}
	$(document).click((e) => {
		if(e.target.closest(".modal")) {
			$(".modal").hide();
		}
		//remove selections if we click outside the list
		if(rendered && !e.target.closest("ul")) {
			setAsEditing(null);
			setSelection(null);
		}
	});
	fs = initializeDropbox();
	if(!fs.isAuthed()) {
		await initModal();
	}
	if (!fs.isLoaded()) {
		console.log("Dropbox could not be found. Sorry.");
		return;
	}
	let fileList = await fs.list();
	console.log("files: " + fileList);
	if(fileList.length == 0) {
		await fs.create("To do", "todo.txt");
	}
	let [data, errors] = await fs.load(fileList[0]);
	activeList = data;

	renderList();
	startSaving();
};

$(() => init() )

function initModal() {
	$("#modal").css("display", "grid");
	$("#dropbox-auth").attr("href", fs.getAuthLink());
	return new Promise((resolve, reject) => {
		//never resolves
		//TODO: click outside / cancel modal, don't log in, and work offline (?)
	});
}

function setEditedFlag() {
	if(!__edited) {
		console.log("edited flipped from false to true");
	} else {
		console.log("edited set to true again");
	}
	__edited = true;
	lastEdit = Date.now();
}

function startSaving() {
	window.setInterval(() => {
		let now = Date.now();
		if(__edited && now - lastEdit > 5000) {
			__edited = false;
			fs.save(activeList);
		}
	}, 1000);
}

const NEWTEXT = "new task...";

function renderList() {
	setupName();

	const $ul = $("#activelist");
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
			setEditedFlag();
			setAsEditing($li);
		});

	activeList.elements.forEach( (li) => {
		$addButton.before(toHtml(li));
	});
	setupDrag();
	setupHotkeys();

	rendered = true;
}

function setupName() {
	const $name = $("#listname");
	$name.text(activeList.title);
	$name.dblclick(() => {
		$name.attr("contenteditable", "true");
		select($name.get()[0]);
		$name.addClass("editing");
	});
	$name.keydown((e) => {
		if($name.hasClass("editing")) {
			if(e.which == 13) { //Enter
				e.preventDefault();
				e.stopPropagation();
				window.getSelection().removeAllRanges();
				$name.removeClass("editing");
				$name.attr("contenteditable", "false");
				setEditedFlag();
				activeList.title = $name.text();
			}
		}
	});
	const $settings = $("#settings");
	$settings.click((e) => {
		fs.logout();
	}).hover(() => {
	 	$settings.addClass("hover");
	}, () => {
		$settings.removeClass("hover");
	});
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
			if(e.which == 13) {
				e.preventDefault();
				e.stopPropagation();
				removeEditing($li);
				window.getSelection().removeAllRanges();
				if($li.next().is("#additem")) {
					$("#additem").click();
				}
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
				} else if(item.status == COMPLETE) {
					setStatus($li, INCOMPLETE);
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
		holdStart = null; //
		$dragging = $li;
		$dragClone = $li.clone();
		let dt = e.originalEvent.dataTransfer;
		dt.setData("text/html", $li);
		dt.effectAllowed = "move";
		dt.dropEffect = "move";
		window.setTimeout(() => {
			$("#trash").addClass("shown");
		}, 10);

	}).on("dragend", (e) => {

	}).on("dragover", (e) => {
		e.preventDefault();
		let $target = $(e.originalEvent.target);
		if(!$target.is($("li.pqitem"))) {
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
		let $target = $(e.originalEvent.target);
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
	$("div#trash").on("dragenter", (e) => {
		e.preventDefault();
		let $target = $(e.originalEvent.target);
		if(!$target.is($("div#trash"))) {
			return;
		}
		$target.addClass("hover");
	}).on("dragover", (e) => {
		e.preventDefault();
	}).on("dragleave", (e) => {
		e.preventDefault();
		let $target = $(e.originalEvent.target);
		if(!$target.is($("div#trash"))) {
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
		if($target.is($("div#trash"))) {
			$dragClone.remove();
			remove($dragging);
		} else if($dragClone) {
			if($dragClone.parent().length > 0) {
				$dragging.detach();
				$dragClone.before($dragging);
				$dragClone.detach();
				const priority = getPriority($dragClone);
				const oldPriority = getPriority($dragging);
				if(oldPriority != priority) { //we're not back where we started
					setEditedFlag();
					setPriority($dragging, priority);
					$dragging.addClass("highlight");

					let $prev = $dragging.prev("li.pqitem");
					let prevPriority = priority;
					//propagate new numbers so we don't have any two equal
					while($prev.length != 0 && getPriority($prev) == prevPriority) {
						prevPriority--;
						setPriority($prev, prevPriority);
						$prev.addClass("highlight");
						$prev = $prev.prev("li.pqitem");
					}
					let nextPriority = priority;
					let $next = $dragging.next("li.pqitem");
					while($next.length != 0 && getPriority($next) == nextPriority) {
						nextPriority++;
						setPriority($next, nextPriority);
						$next.addClass("highlight");
						$next = $next.next("li.pqitem");
					}
				}	
			}
			$dragging.removeClass("dragging");
			$dragClone.remove();
			window.setTimeout(() => {
				$(".highlight").removeClass("highlight");
			}, 1000);
		}
		$dragging = null;
		$dragClone = null;
		$("#trash").removeClass("shown").removeClass("hover");
	});
}

function setupHotkeys() {
	$(document).keydown((e) => {
		let $selection = $("li.selected");
		let $ul = $("#activelist");
		if(e.which == 38) { //up arrow
			if($selection.length == 0) {
				let $li = $ul.find("li.pqitem").last();
				setSelection($li);
			} else {
				let $li = $selection.prev("li.pqitem");
				setSelection($li);
			}
		} else if(e.which == 40) { //down arrow
			if($selection.length == 0) {
				let $li = $ul.find("li.pqitem").first();
				setSelection($li);
			} else {
				let $li = $selection.next("li.pqitem");
				setSelection($li);
			}
		} else if(e.which == 13) { //enter
			if($selection.length != 0) {
				let status = getStatus($selection);
				if(status == INCOMPLETE) {
					setStatus($selection, COMPLETE);
				} else if(status == COMPLETE) {
					setStatus($selection, INCOMPLETE);
				}		
			}
		} else if(e.which == 8) { //delete
			if($selection.length != 0) {
				remove($selection);
			}
		}

	});
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

	const $ul = $("#activelist");
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
		$li.toggleClass("selected");
	}
	const $ul = $("#activelist");	
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
		return $dragClone.find("div.pqpriority").text();
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
			data.comments.push(comment);
		} else if(ENTRY_INCOMPLETE.test(line)) {
			let [_, priority, text, age, comment] = line.match(ENTRY_INCOMPLETE);
			entry = new ListItem(text, priority, getDateBefore(age, Date.now()), INCOMPLETE, comment);
		} else if(ENTRY_COMPLETE.test(line)) {
			let [_, priority, text, age, comment] = line.match(ENTRY_COMPLETE);
			entry = new ListItem(text, priority, getDateBefore(age, Date.now()), COMPLETE, comment);
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
