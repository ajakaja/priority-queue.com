module.exports = function() {
	let lists = {};
	let loggedIn = true;
	return {
		isAuthed() { return loggedIn; },
		isLoaded() { return true; },
		logout() { 
			lists = {};
			loggedIn = false;
		},
		save(data) {
			if(data.newfilename && data.filename) {
				lists[filename] = null;
				lists[newfilename] = data;
			} else {
				lists[filename] = data;
			}
			return "Offline. Not actually saving anything.";
		},
		delete(filename) {
			lists[filename] = null;
		},
		create(data) {
			lists[data.filename] = data; 
		},
		load(filename) {
			if(lists[filename]) { 
				return [lists[filename], null];
			} else {
				return null;
			}
		},
		list() {
			return Object.keys(lists);
		}, 
		test() {
			return true;
		}
	};
};