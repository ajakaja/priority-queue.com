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
function getDateBefore(dateString, lastmodified) {
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
	return new Date(lastmodified.getTime() - diff);
}


function serialize(list) {
	function getAge(date) {
		return getAgeString(date, false);
	}

	let ret = list.title + "\n";
	sortListByPriority(list.elements);
	for(let el of list.elements) {
		if(el.status == DELETED || el.status == ARCHIVED) {
			continue;
		}
		if(!el.__edited && el.__cached) {
			ret += el.__cached + "\n";
		} else {
			switch(el.status) {
				case INCOMPLETE:
				ret += `${el.priority}. ${el.text} [${getAge(el.date)}]\n`;
				break;
				case COMPLETE:
				ret += `X ${el.priority}. ${el.text} [${getAge(el.date)}]\n`;
				break;
				default:
				break;
			}
		}
	}
	let archived = list.elements.filter(e => e.status == ARCHIVED);
	if(archived.length > 0) {
		ret += "\nArchived:\n";
		archived.sort((a,b) => {
			return a.date - b.date;
		});
		for(let el of archived) {
			ret += `* ${el.text} [${getAge(el.date)}]\n`;
		}
	}

	return ret;
}

const ARCHIVE_HEADER = /^Archived:$/;

const PRIORITY = /([0-9]+)\./.source;
const ITEM = /\s?(.+)/.source;
const AGE = /\s?(?:\[([0-9]+[a-z]+)\])/.source; //something of the form [5h] or [14m]

const TITLE = /^(.+)$/;
const ENTRY_INCOMPLETE = new RegExp("^" + PRIORITY + ITEM + AGE + "$");
const ENTRY_COMPLETE = new RegExp(/^X\s*/.source + PRIORITY + ITEM + AGE + "$");
const BLANK = /^\s*$/;
const ENTRY_ARCHIVE = new RegExp(/^\*\s/.source + ITEM + AGE + "$");

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
			entry = new ListItem(text.trim(), priority, getDateBefore(age, lastmodified), INCOMPLETE);
		} else if(ENTRY_COMPLETE.test(line)) {
			let [_, priority, text, age] = line.match(ENTRY_COMPLETE);
			entry = new ListItem(text.trim(), priority, getDateBefore(age, lastmodified), COMPLETE);
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
				entry = new ListItem(text.trim(), null, getDateBefore(age, lastmodified), ARCHIVED);
				entry.__cached = line;
				data.elements.push(entry);
			} else {
				errors.push(`Could not make sense of line #${i}: '${line}'.`);
			}
			i++;
		}
	}

	return [data, errors];
}