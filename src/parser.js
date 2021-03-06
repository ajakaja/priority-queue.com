const Types = require("./types.js");
const List = Types.List;
const ListItem = Types.ListItem;

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
		if (a.status == Types.ARCHIVED) {
			if (b.status == Types.ARCHIVED) {
				return 0;
			}
			return 1;
		} else if (b.status == Types.ARCHIVED) {
			return -1;
		}
		return a.priority - b.priority;
	});
}

module.exports = {
	serialize(list) {
		sortListByPriority(list.elements);
		let ret = "";
		for(let el of list.elements) {
			if(el.status == Types.DELETED || el.status == Types.ARCHIVED) {
				continue;
			}
			if(!el.__edited && el.__cached && false) {
				ret += el.__cached + "\n";
			} else {
				switch(el.status) {
					case Types.INCOMPLETE:
					ret += `${el.priority}. ${el.text}\n`;
					break;
					case Types.COMPLETE:
					ret += `X ${el.priority}. ${el.text}\n`;
					break;
					default:
					break;
				}
			}
		}
		let archived = list.elements.filter(e => e.status == Types.ARCHIVED);
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
		if(lines.length === 0) {
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
		let archive = false;

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
				let [_, priority, content, age] = line.match(ENTRY_INCOMPLETE);
				entry = new ListItem(content.trim(), priority, Types.INCOMPLETE);
			} else if(ENTRY_COMPLETE.test(line)) {
				let [_, priority, content, age] = line.match(ENTRY_COMPLETE);
				entry = new ListItem(content.trim(), priority, Types.COMPLETE);
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
					let [_, content, age] = line.match(ENTRY_ARCHIVE);
					entry = new ListItem(content.trim(), null, Types.ARCHIVED);
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
};