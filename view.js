"use strict";

function initView() {

	const ENTER = 13;
	const DELETE = 8;
	const UP = 38;
	const DOWN = 40;
	const ESCAPE = 27;
	const SPACE = 32;
	const Z = 90;

	const hints = {};
	const NEWTEXT = "new task...";

	const holdTime = 600;
	var holdStart;

	//a hack to work around the stupidity of the dragging API -- dragenter/dragleave/etc provide no reference to the object being dragged
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

	let toggleLoader = () => {$loader.toggleClass("hidden")};
	let toggleModal = () => {$modal.toggleClass("hidden")};

	$("#dropbox-auth").attr("href", fs.getAuthLink());
	$modal.click((e) => {
		if($(e.target).is($modal)) {
			toggleModal();
			setHint("you have to log in...");
		}
	});

	function setupList() {
		$addButton.click(() => {
			let lastPriority;
			let $last = $("li.pqitem").last();
			if($last.length > 0) {
				let variance = randInt(1, 5);
				lastPriority = getPriority($last) + variance; 
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

		$(document).mousedown((e) => {
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
		}).keydown((e) => {
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
		$newfile.keydown((e) => {
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
		});
		$filename.mousedown((e) => {
			$filemenu.toggleClass("open");
			return false;
		});

		$("#settingsbutton").mousedown(e => {
			$("#settings").addClass("open");
			return false;
		});
		$("#logout").mousedown(logout);
		$("#cleanup").mousedown(deleteCompleted);
		$("#archive").mousedown(archiveCompleted);
		$("#renumber").mousedown(resetPriorities);
		$("#about").mousedown();
	}

	function createFileItem(filename) {
		const $clone = $(document.importNode(filetemplate.content, true));
		let $li = $clone.find("li.fileitem");
		setText($li, filename);
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
		$li.mousedown((e) => {
			openFile(getText($li));
			return false;
		}).hover(() => $li.addClass("hover"), () => $li.removeClass("hover"));
		$li.find("div.edit").mousedown((e) => {
			setAsEditing($li);
			$filemenu.addClass("open");
			return false
		});
		let $delete = $li.find("div.delete"),
			$cancel = $li.find("div.cancel"),
			$confirm = $li.find("div.confirm");
		$delete.mousedown((e) => {
			$confirm.removeClass("hidden");	
			$cancel.removeClass("hidden");		
			$delete.addClass("hidden");
			setSelection($li);
			return false;
		});
		$confirm.mousedown((e) => {
			deleteFile(getText($li))
				.then(() => $li.detach());
			return false;
		});
		$cancel.mousedown((e) => {
			$confirm.addClass("hidden");	
			$cancel.addClass("hidden");		
			$delete.removeClass("hidden");
			return false;
		});
		return $li;
	}


	function createPQItem(item) {
		const $clone = $(document.importNode(rowtemplate.content, true));
		let $li = $clone.find("li.pqitem");
		$li.data("item", item);
		let $text = $li.find("div.text");
		$text.html(item.text)
			.keydown((e) => {
				if(e.which == ENTER) {
					if(!e.shiftKey) {
						removeEditing($li);
						e.preventDefault();
					}

				}
				e.stopPropagation();
			});
		$li.hover(() => $li.addClass("hover"), () =>  $li.removeClass("hover"))
			.mousedown(e => {
				holdStart = Date.now();
				let time = holdStart;
				//if we hold for more than holdTime, set as editing.
				window.setTimeout(() => {
					if(holdStart == time) { //if no one has changed holdStart
						setAsEditing($li);
					}
				}, holdTime);
			 	if(hints.selection) {
					setHint("(click and hold to edit)", false);
				}
				e.stopPropagation();
			}).mouseup(e => {
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
				return false;
			})
			.click(() => false );
		renderStatus($li, item.status, item.priority);
		$li.find("div.pqdate").text(`(${getAgeString(item.date)})`);
		$li.find("div.edit").mousedown((e) => {
				setAsEditing($li);
				return false;
			});
		$li.find("div.close").mousedown((e) => {
			remove($li);
			return false;
		});
		$li.find("div.check").mousedown((e) => {
			if(item.status == INCOMPLETE) {
				setStatus($li, COMPLETE);
			} else if(item.status == COMPLETE) {
				setStatus($li, INCOMPLETE);
			}
			return false;
		});
		$li.find("div.urgent").mousedown((e) => {
			e.stopPropagation();
			let $first = $("li.pqitem").first();
			if(!$li.is($first)) {
				let priority = getPriority($first) - randInt(1, 5);
				setPriority($li, priority);
				$li.detach().insertBefore($first);
			}
			return false;
		});
		addDrag($li);
		return $li;
	} 

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
		let inside = (x, y, $e) => {
			let o = $e.offset();
			return x >= o.left &&
				x <= o.left + $e.width() &&
				y >= o.top &&
				y <= o.top + $e.height();
		}
		$trash.on("dragenter", (e) => {
			e.preventDefault();
			if(inside(e.clientX, e.clientY, $trash)) {
				$trash.addClass("hover");
			}
		}).on("dragover", (e) => {
			e.preventDefault();
		}).on("dragleave", (e) => {
			e.preventDefault();
			if(!inside(e.clientX, e.clientY, $trash)) {
				$trash.removeClass("hover");
			}
		});
		$(document)
			.on("dragover", (e) => {e.preventDefault(); })
			.on("dragenter", (e) => {e.preventDefault(); })
			.on("drop", (e) => {
			e.preventDefault();
			if(inside(e.clientX, e.clientY, $trash)) {
				remove($dragging);
				$dragClone.remove();
			} else if($dragClone) {
				if($dragClone.parent().length > 0) {
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
			}
		});
	}

	function renderList() {
		unrender();
		activeList.elements
			.filter(e => e.status != ARCHIVED && e.status != DELETED)
			.forEach(li => {
				$addButton.before(createPQItem(li));
			});
	}
	function renderName() {
		$name.text(activeList.title);
		if(activeList.filename) {
			$filename.text(activeList.filename);
		}
		for(let i of fileList) {
			createFileItem(i).appendTo($files);
		}
	}
	function unrender() {
		$("li.pqitem").remove();
		$("li.fileitem").remove();
		$filename.text("");
		$name.text("");
	}
	function setAsEditing($li) {
		$(".editing").each((i, e) => {
			let $e = $(e)
			if(!$e.is($li)) {
				removeEditing($e);
			}
		});
		$name.removeClass("editing");
		if($li && !$li.hasClass("editing")) {
			const $text = $li.children(".text");
			$text.attr("contenteditable", "true");
			setSelection($li);
			$li.addClass("editing");
			selectText($text);
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

	function renderPriority($li, priority, status) {
		if(status == COMPLETE) {
			$li.find(".pqpriority").text("✔");
		} else {
			$li.find(".pqpriority").text(priority);
		}
	}
	function setStatus($li, status) {
		let item = $li.data("item");
		if(item.status != status) {
			set(item, "status", status);
			renderStatus($li, status, item.priority);
		}
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
		if($e) {
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
			set(item, "priority", priority);
			renderPriority($li, priority, item.status);
		}
	}
	function getText($li) {
		return $li.find("div.text").text();
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
			unrender();
			if(loggedIn) {
				if(activeList) {
					renderList();
					renderName();
					window.location.hash = activeList.filename;
				}
			} else {
				toggleModal();
			}
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
		}
		
	}
}