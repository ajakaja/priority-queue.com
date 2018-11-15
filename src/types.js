const URL = "https://priority-queue.com";
const INCOMPLETE = "incomplete";
const COMPLETE = "complete";
const DELETED = "deleted";
const ARCHIVED = "archived";


class ListItem {
	constructor(text, priority, status) {
		this.text = text;
		this.priority = Number.parseInt(priority);
		this.status = status;
		this.__edited = false;
	}
}

class List {
	constructor(elements = [], filename = "") {
		this.title = filename;
		this.elements = elements;
		this.filename = filename;
		this.newfilename = null;
		this.deltas = [];
	}
}

module.exports = {
	List: List,
	ListItem: ListItem,
	URL: "https://priority-queue.com", 
	INCOMPLETE: "incomplete", 
	COMPLETE: "complete",
	DELETED: "deleted",
	ARCHIVED: "archived"
};