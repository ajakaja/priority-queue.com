function error(error){
	console.log(error);
}

function debugActive() { 
	setTimeout(
		() => { 
		console.log(document.activeElement);
		debugActive(); 
	}, 2000); 
};
debugActive();

const INCOMPLETE = "incomplete";
const COMPLETE = "complete";
const CANCELLED = "cancelled";

class ListItem {
	constructor(text, priority, date, status) {
		this.text = text;
		this.priority = priority;
		this.date = date;
		this.status = status;
	}
}

class List {
	constructor(title, elements) {
		this.title = title;
		this.elements = elements;
	}
}
2
const lists = [];
let activeList = null;
let dbx = null;

const hints = {
	selection: true,
	delete: true,
	priority: true
}


$(() => {
	if (!("content" in document.createElement("template"))) {
		alert("your browser's too old for this. sorry.");
		return;
	}
	initializeDropbox();
	if (!dbx) {
		alert("Dropbox could not be found. Sorry.");
		return;
	}
	setupName();
	renderList();
	setupDrag();
	setupHotkeys();
	$(document).click((e) => {
		//remove selections if we click outside the list
		if(!e.target.closest("ul")) {
			setAsEditing(null);
			setSelection(null);
		}
	});
});

function renderList() {
	const $ul = $("#activelist");
	const $addButton = $("#additem")
		.click(() => {
			let lastPriority;
			if(activeList.elements.length != 0) {
				lastPriority = activeList.elements[activeList.elements.length-1].priority+1; 
			} else {
				lastPriority = 1;
			}
			const li = new ListItem("new task...", lastPriority, new Date(), INCOMPLETE)
			activeList.elements.push(li);
			let $li = toHtml(li);
			$addButton.before($li);
			setAsEditing($li);
		});

	activeList.elements.forEach( (li) => {
		$addButton.before(toHtml(li));
	});
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
			}
		}
	});
}

const holdTime = 600;
var holdStart;

function toHtml(item) {
	const template = $("#rowtemplate").get()[0];
	const $clone = $(document.importNode(template.content, true));
	let $li = $clone.find("li.pqitem");
	$li.data("item", item);
	$li.find("div.pqtext")
		.text(item.text)
		.keydown((e) => {
			if(e.which == 13) {
				e.preventDefault();
				e.stopPropagation();
				removeEditing($li);
				window.getSelection().removeAllRanges();
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
				if(holdStart == time) {
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
	setStatus($li, item.status);
	$li.find("div.pqdate")
		.text(`(${getAgeString(item.date)})`);
	$li.find("div.edit")
		.mousedown((e) => {
			setAsEditing($li);
			e.stopPropagation();
		});
	$li.find("div.close")
		.mousedown((e) => {
			if(item.status == INCOMPLETE) {
				setStatus($li, CANCELLED);
				if(hints.delete) {
					setHint("(✗ an item again to permanently erase it)");
					hints.delete = false;
				}
			} else if(item.status == COMPLETE || item.status == CANCELLED) {
				remove($li, item);
			}
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
			$dragging.remove();
			$dragClone.remove();
		} else if($dragClone) {
			if($dragClone.parent().length > 0) {
				$dragging.detach();
				$dragClone.before($dragging);
				$dragClone.detach();
				const priority = getPriority($dragClone);
				const oldPriority = getPriority($dragging);
				if(oldPriority != priority) { //we're not back where we started
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
				let status = getStatus($selection);
				if(status == INCOMPLETE) {
					setStatus($selection, CANCELLED);
				} else if(status == CANCELLED || status == COMPLETE) {
					remove($selection);
				}
			}
		}

	});
}


function setStatus($li, status) {
	[COMPLETE, INCOMPLETE, CANCELLED].forEach((i) => {
		if(status != i) {
			$li.removeClass(i);
		}
	});
	$li.addClass(status);
	let item = $li.data("item");
	item.status = status;
	renderPriority($li, item.priority, status);
}

function setAsEditing($li) {
	if($li) {
		const $text = $li.children(".pqtext");
		$text.attr("contenteditable", "true");
		setSelection($li);
		$li.addClass("editing");
		select($text.get()[0]);
		$text.blur((e) => { //TODO: why is it blurring right after you press the edit button?
			console.log("blurred:");
			console.log(e);
		});
		$text.focus((e) => {
			console.log("focused:");
			console.log(e);
		});
		$text.focus();
	}

	const $ul = $("#activelist");
	$ul.children("li").each( (i, e)=> {
		$e = $(e)
		if(!$e.is($li)) {
			$div = $e.children(".pqtext");
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
	$div = $li.children(".pqtext");
	$li.removeClass("editing");
	$div.attr("contenteditable", "false");
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
	}
}

function renderPriority($li, priority, status) {
	if(status == COMPLETE) {
		$li.find(".pqpriority").text("✔");
	} else if(status == CANCELLED) {
		$li.find(".pqpriority").text("✗");
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
}

function getAgeString(date) {
	let diff = (Date.now() - date.getTime()) / 1000;
	if(diff < 0)
		return "??";
	if(diff < 5)
		return "just now";
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
