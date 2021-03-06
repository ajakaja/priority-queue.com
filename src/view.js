const $ = require("jquery-slim");
const Types = require("./types.js");
const Cookies = require("cookies-js");
const List = Types.List;
const ListItem = Types.ListItem;

module.exports = function(pq) {

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
		$("#dropbox-auth").attr("href", pq.dropbox.getAuthLink());

		$modal.click(e => {
			if($(e.target).is($modal)) {
				if(!pq.dropbox.isAuthed()) {
					pq.initLoggedIn(pq.demo);
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
			if(pq.dropbox.isAuthed()) {
				toggleModal(false);
			} else {
				$("#modal-dropbox").removeClass("hidden");
				$("#modal-about").addClass("hidden");
			}
			return false;
		});
		$("#demo-login").click(e => {
			toggleModal(false);
			pq.initLoggedIn(pq.demo);
			setHint("Offline. Not actually saving anything.");
		});
	})();


	const primes = [17, 31, 43, 71, 83, 101];

	function hashNines(str) {
		let hash = 0, char;
		for(let i = 0; i < str.length; i++) {
			char = str.charCodeAt(i);
			//each character cycles the range at a different speed.. ish
			hash = (hash + char * primes[i % primes.length]) % 729;
		}
		return [hash % 9, Math.floor(hash / 9) % 9, Math.floor(hash / 81)];
	}

	// Generate an interesting color from a string
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

	function toggle(status) {
		if(status == Types.INCOMPLETE) {
			return Types.COMPLETE;
		}
		if(status == Types.COMPLETE) {
			return Types.INCOMPLETE;
		}
		return null;
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

	function addItem(priority, $location) {
		const item = new ListItem(NEWTEXT, priority, new Date(), Types.DELETED);
		pq.getActiveList().elements.push(item);
		pq.set(item, "status", Types.INCOMPLETE);
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
		$save.click(pq.saveFile);
		$newfile.keydown(e => {
			if(e.which == ENTER) {
				let validname = validFilename($newfile.text());
				if(!!validname) {
					let $li = createFileItem(validname);
					$li.appendTo($files);
					$newfile.text("");
					$filemenu.removeClass("open");
					pq.openFile(validname, true);
				} else {
					setHint("filenames must be alphanumeric + .txt");
					$newfile.text("");
				}
				e.preventDefault();
			}
			e.stopPropagation();
		}).mousedown(e => {
			if(e.button !== 0) {
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
			if(e.button !== 0) {
				return false;
			}
			$(".open").removeClass("open");
			$("#settings").toggleClass("open");
			return false;
		});
		createMenuButton("#logout", pq.logout);
		createMenuButton("#login", () => toggleModal(true, MODAL_DBX));
		createMenuButton("#archive", pq.archiveCompleted);
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
		});
		if(Cookies.get(COLOR_COOKIE) == "true") {
			colors = true;
		}
	}

	function createMenuButton(id, fn) {
		$(id).mousedown(e => {
			if(e.button !== 0) {
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
				$("#modal-about").removeClass("hidden");
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
					pq.renameFile(oldname, newname).then(() => {
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
			if(e.button !== 0) {
				$filemenu.addClass("open");
				return false;
			}
			pq.openFile(getText($li));
			$filemenu.removeClass("open");
			return false;
		});
		$li.find("div.edit").mousedown(e => {
			setAsEditing($li);
			$filemenu.addClass("open");
			return false;
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
		let activeList = pq.getActiveList();
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
		pq.getFileList().sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
		for(let i of pq.getFileList()) {
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
		let activeList = pq.getActiveList();
		$filename.text(activeList.filename);
		$("li.pqitem").remove();
		activeList.elements
			.filter(e => e.status != Types.ARCHIVED && e.status != Types.DELETED)
			.forEach(li => $addButton.before(createPQItem(li)));
	}
	function rerenderList() {
		let $lis = $("li.pqitem");
		let statuses = [Types.COMPLETE, Types.INCOMPLETE];

		let changedPriority = false;
		$lis.each((i, li) => {
			let $li = $(li);
			let item = $li.data("item");
			// __edited is an optimization, so we only check things that have changed. Hence the weird sidechannel.
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
			$lis = $lis.sort( (a, b) => getPriority($(a)) - getPriority($(b)));
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
	}

	function mousedownHandler(e) {
		let $target = $(e.target);
		let $this = $(this);
		if(e.button !== 0) {
			return;
		}
		if($target.closest("div.edit").length) {
			setAsEditing($this);
			return false;
		}
		if($target.closest("div.check").length) {
			let data = $this.data("item");
			setStatus($this, toggle(data.status));
			return false;
		}
		// Changed to 'closest' because the Div contains an <svg> tag, which is the actual recipient of the event.
		if($target.closest("div.close").length) {
			remove($this);
			return false;
		}
		if($target.closest("div.add").length) {
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
		if(e.button !== 0) {
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
		pq.startSequence();
		$("li.pqitem").each((i, e) => {
			let $e = $(e);
			if(getPriority($e) != i+1) {
				setPriority($e, i+1);
				highlight($e);
			}
		});
		pq.endSequence();
	}

	function setupHotkeys() {
		$(document).keydown(e => {
			let $selection = $("li.selected");
			let hasSelection = ($selection.length !== 0);
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
						e.preventDefault();
					}
					break;
				case SPACE:
					if (hasSelection && !$selection.hasClass("editing")) {
						let status = getStatus($selection);
						if (status == Types.INCOMPLETE) {
							setStatus($selection, Types.COMPLETE);
						} else if (status == Types.COMPLETE) {
							setStatus($selection, Types.INCOMPLETE);
						}
						e.preventDefault();
					}
					break;
				case DELETE:
					if (hasSelection && !$selection.hasClass("editing")) {
						remove($selection);
						e.preventDefault();
					}
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
							pq.redo();
						} else {
							pq.undo();
						}
						return false;
					}
					break;
				case S:
					if(e.metaKey || e.ctrlKey) {
						pq.saveFile();
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
		pq.startSequence();
		setPriority($a, pB);
		setPriority($b, pA);
		pq.endSequence();
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
		if(status == Types.COMPLETE) {
			$li.removeClass(Types.INCOMPLETE);
			$li.addClass(Types.COMPLETE);
		} else if(status == Types.INCOMPLETE) {
			$li.removeClass(Types.COMPLETE);
			$li.addClass(Types.INCOMPLETE);
		}
	}

	function renderPriority($li, status, priority) {
		$li.find(".pqpriority").text(priorityText(status, priority));
	}

	function priorityText(status, priority) {
		return (status == Types.COMPLETE) ? "✔" : priority;
	}
	function setStatus($li, status) {
		let item = $li.data("item");
		if(item.status != status) {
			pq.set(item, "status", status);
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
				pq.set(item, "text", text);
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
			pq.set(item, "priority", priority);
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
		highlight($li);
		// I think it feels better if there's a slight pause before deleting.
		window.setTimeout(() => {
			let item = $li.data("item");
			pq.set(item, "status", Types.DELETED);
			$li.detach();
			resetPriorities();
		}, 300);
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
				let activeList = pq.getActiveList();

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
				setHint("unsaved! will save in a sec if you don't do anything.", false);
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
	};
};