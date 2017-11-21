function serialize(list) {
	let ret = list.title + "\n";
	sortListByPriority(list.elements);
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
}

const ARCHIVE_HEADER = /^Archived:$/;

const PRIORITY = /(-?[0-9]+)\./.source;
const ITEM = /\s?(.+)/.source;

const TITLE = /^(.+)$/;
const ENTRY_INCOMPLETE = new RegExp("^" + PRIORITY + ITEM + "$");
const ENTRY_COMPLETE = new RegExp(/^X\s*/.source + PRIORITY + ITEM + "$");
const BLANK = /^\s*$/;
const ENTRY_ARCHIVE = new RegExp(/^\*\s/.source + ITEM + "$");

//todo: match the string first, then optionally the date.

function deserialize(text, lastmodified) {
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