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

	let firstComment = null;
	let i = firstLine;
	while(true) {
		if(i >= lines.length) {
			break;
		}
		let line = lines[i];
		let entry = null;
		if(BLANK.test(line)) {
		} else if (COMMENT_LINE.test(line)) {
			firstComment = i;
			let comment = line.match(COMMENT_LINE)[1];
			data.comments.push(comment).trim();
		} else if(ENTRY_INCOMPLETE.test(line)) {
			let [_, priority, text, age, comment] = line.match(ENTRY_INCOMPLETE);
			entry = new ListItem(text.trim(), priority, getDateBefore(age, lastmodified), INCOMPLETE, comment);
		} else if(ENTRY_COMPLETE.test(line)) {
			let [_, priority, text, age, comment] = line.match(ENTRY_COMPLETE);
			entry = new ListItem(text.trim(), priority, getDateBefore(age, lastmodified), COMPLETE, comment);
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