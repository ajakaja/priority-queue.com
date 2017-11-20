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
	const $name = $("#listname");
	const $filename = $("#filename");
	const $addButton = $("#additem");
	const $newfile = $("#newfile");
	const $modal = $("#modal");
	const rowtemplate = $("#rowtemplate").get()[0];
	const filetemplate = $("#filetemplate").get()[0];
	const $trash = $("#trash");
	const $hint = $("#hint");
	const $files = $("#files");
	const $filemenu = $("#filemenu");
	const $settings = $("#settings");

	let colors = false;
	const DEFAULT_COLORS = ["#9cc", "#699", "#abc"];
	const COLOR_COOKIE = "colors";

	let toggleLoader = () => $loader.toggleClass("hidden");

	$("#dropbox-auth").attr("href", fs.getAuthLink());

	$modal.click(e => {
		if($(e.target).is($modal)) {
			toggleModal();
		}
	});

	function setupList() {
		$addButton.click(() => {
			let lastPriority;
			let $last = $("li.pqitem").last();
			if($last.length > 0) {
				lastPriority = getPriority($last) + randInt(1, 3);
			} else {
				lastPriority = 1;
			}
			const item = new ListItem(NEWTEXT, lastPriority, new Date(), DELETED);
			activeList.elements.push(item);
			set(item, "status", INCOMPLETE);
			let $li = createPQItem(item);
			$addButton.before($li);
			setAsEditing($li);
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
		$name.dblclick(() => {
			$name.attr("contenteditable", "true");
			selectText($name);
			$name.addClass("editing");
		}).keydown(e => {
			if($name.hasClass("editing")) {
				if(e.which == ENTER) {
					e.preventDefault();
					e.stopPropagation();
					window.getSelection().removeAllRanges();
					$name.removeClass("editing");
					$name.attr("contenteditable", "false");
					if($name.text() != activeList.title) {
						set(activeList, "title", $name.text());
					}
				}
			}
		});
		$save.click(save);
		$newfile.keydown(e => {
			if(e.which == ENTER) {
				let validname = validFilename($newfile.text());
				if(!!validname) {
					let $li = createFileItem(c);
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

		$("#settingsbutton").mousedown(e => {
			if(e.button != 0) {
				return false;
			}
			$(".open").removeClass("open");
			$("#settings").toggleClass("open");
			return false;
		});
		createMenuButton("#logout", logout);
		createMenuButton("#cleanup", deleteCompleted);
		createMenuButton("#archive", archiveCompleted);
		createMenuButton("#renumber", resetPriorities);
		createMenuButton("#togglecolors", toggleColors);
		createMenuButton("#about", () => {
			$("#settings").removeClass("open");
			$("#modal-about").removeClass("hidden");
			toggleModal();
		});
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

	function toggleColors() {
		if(colors) {
			colors = false;
			renderName();
			Cookies.set(COLOR_COOKIE, "false");
		} else {
			colors = true;
			renderName();
			Cookies.set(COLOR_COOKIE, "true");
		}
	}

	function toggleModal() {
		if($modal.hasClass("hidden")) {
			$modal.removeClass("hidden");
		} else {
			$modal.addClass("hidden");
			$("#modal-dropbox").addClass("hidden");
			$("#modal-about").addClass("hidden");
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
			deleteFile(getText($li))
				.then(() => $li.detach());
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


	function renderName() {
		$name.text(activeList.title);
		if(colors) {
			setColors(activeList.filename);
		} else {
			setColors(null);
		}
		if(activeList.filename) {
			$filename.text(activeList.filename);
		}
		$("li.fileitem").remove();
		fileList.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
		for(let i of fileList) {
			createFileItem(i).appendTo($files);
		}
		$save.addClass("shown");
	}
	function unrender() {
		$("li.pqitem").remove();
		$("li.fileitem").remove();
		$filename.text("");
		$name.text("");
	}

	function renderList() {
		$name.text(activeList.title);
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
				$li.find("div.pqdate").text(`(${getAgeString(item.date)})`);
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
		$li.find("div.pqdate").text(`(${getAgeString(item.date)})`);

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
		if(e.which == ENTER && !e.shiftKey) {
			removeEditing($(this).closest("li.pqitem"));
			e.preventDefault();
		}
		if(e.which == ESCAPE) {
			removeEditing($(this).closest("li.pqitem"));
			e.preventDefault();
		}
		e.stopPropagation();
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
				let priority = getPriority($first);
				setPriority($this, priority);
				$this.detach().insertBefore($first);
			}
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
					startSequence();

					$dragging.detach();
					$dragClone.before($dragging);
					$dragClone.detach();

					let index = $dragging.index() - 1; //Jquery index starts at 1
					let item = $dragging.data("item");

					const priority = getPriority($dragClone);
					const oldPriority = getPriority($dragging);
					if(oldPriority != priority) { //we're not back where we started
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
					endSequence();
				}
				$dragging.removeClass("dragging");
				$dragClone.remove();
			}
			$dragging = null;
			$dragClone = null;
			$trash.removeClass("shown").removeClass("hover");
		});
	}

	function setupHotkeys() {
		$(document).keydown(e => {
			let $selection = $("li.selected");
			switch (e.which) {
				case UP:
					if($selection.length == 0) {
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
					if($selection.length == 0) {
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
			$("#togglecolors").text("decolorize");
		} else {
			colors = DEFAULT_COLORS; 
			$("#togglecolors").text("colorize!");
		}
		$("body").css("background-color", colors[0]);
		$("#titlebar").css("background-color", colors[1]);
		$("#fileselector").css("background-color", colors[2]);
	}
	window.setColors = setColors;

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
			let $hint2 = $hint.clone(false);
			$hint.after($hint2);
			$hint.remove();
			$hint2.text(text);
			$hint2.css({"animation": "fadeout", 
						"animation-duration": "4s"});
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
				}
			} else {
				unrender();
				$("#modal-dropbox").removeClass("hidden");
				toggleModal();
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
		}
	}
}