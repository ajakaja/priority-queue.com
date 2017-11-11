"use strict";

function initializeDropbox() {
	const CLIENT_ID = "oh0zj30oa52f1y3";
	const COOKIE = "dropbox-token";

	function getToken() {
		if(token != null) {
			return token;
		}
		let cookie = Cookies.get(COOKIE);
		if(cookie) {
			window.history.replaceState({}, document.title, window.location.origin);
			return cookie;
		}
		let params = new URLSearchParams(window.location.hash.slice(1));
		let ret = params.get("access_token");
		if(!!ret) {
			Cookies.set(COOKIE, ret);
			window.history.replaceState({}, document.title, window.location.origin);
		}
		return ret;
	}

	function isAuthenticated() {
		if(token != null) {
			return true;
		}

		return !!getToken();
	}

	let dbx;
	let authenticated = false;
	let token = null;

	if(isAuthenticated()) {
		token = getToken();
		authenticated = true;
		dbx = new Dropbox({ accessToken: token });
	}

	return {
		isAuthed() { return authenticated; },
		isLoaded() { return !!dbx; },
		getAuthLink() {
			let redirectUrl;
			if(window.location.href.includes("localhost")) {
				redirectUrl = "http://localhost:8080";
			} else {
				redirectUrl = URL;
			}
			return `https://www.dropbox.com/1/oauth2/authorize?client_id=${CLIENT_ID}`
				+ `&response_type=token&redirect_uri=${redirectUrl}`;
		},
		async logout() {
			Cookies.remove(COOKIE);
			authenticated = false;
			token = null;
			await dbx.authTokenRevoke();
			if(window.location.href.includes("access_token")) {
				if(window.location.href.includes("localhost")) {
					redirectUrl = "http://localhost:8080";
				} else {
					redirectUrl = URL;
				}
				window.location = redirectUrl;
			}
		},
		async save(data) {
			if(data.newfilename && data.filename) {
				let oldfilename = data.filename;
				data.filename = data.newfilename;
				let response = await dbx.filesMove({
					from_path: "/" + oldfilename,
					to_path: "/" + data.filename,
				});
			}
			let text = serialize(data);
			if(!data.filename) {
				throw "No filename";
			}
			console.log("saving data in " + data.filename);
			let response = await dbx.filesUpload({path: "/" + data.filename, 
					contents: text, 
					mode: "overwrite"});
		},
		async delete(filename) {
			throw "not yet implemented";
		},
		async create(data) {
			let text = serialize(data);
			console.log(`creating new file called '${data.filename}'.`);
			let response = await dbx.filesUpload({path: "/" + data.filename,
				contents: text
			});
		},
		async load(filename) {
			let response = await dbx.filesDownload({path: "/" + filename});
			let blob = response.fileBlob;
			var reader = new FileReader();

			let promise = new Promise((resolve, reject) => {
			    reader.addEventListener("loadend", () => {
			    	resolve(reader.result);
			    });
			});
			reader.readAsText(blob);
			let text = await promise;
			let [data, errors] = deserialize(text);
			data.filename = filename;
			return [data, errors];
		},
		async list() {
			let response = await dbx.filesListFolder({path: ''});
			let entries = response.entries.filter((e) => {
				return e[".tag"] == "file";
			}).map((e) => {
				return e.name;
			});
			return entries;
		},
		async test() {
			try {
				let response = await dbx.usersGetCurrentAccount();
				return true;
			} catch (e) {
				return false;
			}
		}
	};
}