"use strict";

function initView() {

	const ENTER = 13;
	const DELETE = 8;
	const UP = 38;
	const DOWN = 40;
	const ESCAPE = 27;
	const SPACE = 32;

	const hints = {};
	const NEWTEXT = "new task...";

	const holdTime = 600;
	var holdStart;

	//a hack to work around the stupidity of the dragging API -- dragenter/dragleave/etc provide no reference to the object being dragged
	var $dragging = null;
	var $dragClone = null;

	const $name = $("#listname");
	const $filename = $("#filename");
	const $addButton = $("#additem");
	const $save = $("#save");
	const $newfile = $("#newfile");
	const $settings = $("#settings");
	const $modal = $("#modal");
	const $fileselector = $("#fileselector");
	const template = $("#rowtemplate").get()[0];
	const $trash = $("#trash");
	const $hint = $("#hint");
	const $files = $("#files");

	let toggleLoader = cycle(() => $loader.css("display", "block"), () => $loader.hide());

	$("#dropbox-auth").attr("href", fs.getAuthLink());
	$modal.click((e) => {
			if($(e.target).is($modal)) {
				$modal.hide();
				setHint("you have to log in...");
			}
		});

	function setupList() {
		$addButton.click(() => {
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

		setupDrag();
		setupHotkeys();

		$("body").click((e) => {
			//remove selections if we click outside the list
			if(!e.target.closest("ul")) {
				setAsEditing(null);
				setSelection(null);
				if($fileselector.is(":visible")) {
					$fileselector.css("display", "none");
				}
			}
		});
	}

	function setupTitleBar() {
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
						} else {
							setEditedFlag();
							activeList.newfilename = filename;
						}
					}
				}
			}
		});*/
		$save.click((e) => {
			save();
		});
		$settings.click((e) => {
			logout();
		});
		$newfile.click((e) => {
			e.stopPropagation();
			e.preventDefault();
			let $li = createFileItem("new file...");
			$li.attr("contenteditable", "true")
				.addClass("editing")
				.insertBefore($newfile)
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
							openFile(name, true);
						} else {
							setHint("filenames must be alphanumeric + .txt");
						}
					}
				});
			select($li.get()[0]);
		});
	}

	function createFileItem(item) {
		let $li = $("<li/>", {
			text: item,
			class: "fileitem"
		});
		$li.click((e) => {
			e.stopPropagation();
			e.preventDefault();
			$fileselector.hide();
			toggleLoader();
			openFile($li.text())
				.then(toggleLoader);
		});
		return $li;
	}

	function toHtml(item) {
		const $clone = $(document.importNode(template.content, true));
		let $li = $clone.find("li.pqitem");
		$li.data("item", item);
		let $text = $li.find("div.pqtext");
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
					setHint("(click and hold to edit)", false);
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
		$li.find("div.edit").mousedown((e) => {
				setAsEditing($li);
				e.stopPropagation();
				e.preventDefault();
			});
		$li.find("div.close").mousedown((e) => {
			remove($li, item);
			e.stopPropagation();
		});
		$li.find("div.check").mousedown((e) => {
			if(item.status == INCOMPLETE) {
				setStatus($li, COMPLETE);
			} else if(item.status == COMPLETE) {
				setStatus($li, INCOMPLETE);
			}
			e.stopPropagation();
		});
		$li.find("div.urgent").mousedown((e) => {
			e.stopPropagation();
			let $first = $("li.pqitem").first();
			let priority = getPriority($first) - 1;
			setPriority($li, priority);
			$li.detach().insertBefore($first);
			let item = $li.data("item");
			activeList.elements.move(item, 0);
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

	function renderList() {
		unrender();
		activeList.elements.forEach( (li) => {
			$addButton.before(toHtml(li));
		});
	}
	function renderName() {
		$name.text(activeList.title);
		if(activeList.filename) {
			$filename.text(activeList.filename);
		}
		for(let i of fileList) {
			createFileItem(i).prependTo($files);
		}
	}
	function unrender() {
		$("li.pqitem").remove();
		$("li.fileitem").remove();
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
		$name.removeClass("editing");
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
			setEditedFlag();
			item.status = status;
			view.renderStatus($li, status, item.priority);
		}
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
	function highlight($el) {
		$el.addClass("highlight");
		window.setTimeout(() => {
			$el.removeClass("highlight");
		}, 1000);
	}
	function select(node) {
		let range = document.createRange();
		let selection = window.getSelection();
		range.selectNodeContents(node);
		selection.removeAllRanges();
		selection.addRange(range);
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
	function setHint(text, repeat=true) {
		if(repeat || !hints[text]) {
			//add a new element that copies the existing one, to reset the animation
			//not sure if there's a better way...
			$hint2 = $hint.clone(false);
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

	setupTitleBar();
	setupList();

	return {
		toggleLoader: toggleLoader,
		render(loggedIn=true) {
			if(loggedIn) {
				unrender();
				renderList();
				renderName();
			} else {
				unrender();
				$("#modal").show();
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
		}
		
	}
}