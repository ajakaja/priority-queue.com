function initializeDropbox() {
	const CLIENT_ID = "oh0zj30oa52f1y3";

	function getToken() {
		let params = new URLSearchParams(window.location.hash.slice(1));
		let token = params.get("access_token");
		return token;
	}

	function isAuthenticated() {
		return !!getToken();
	}

	let dbx;
	let authenticated = false;
	let token;
	if(isAuthenticated()) {
		token = getToken();
		authenticated = true;
		dbx = new Dropbox({ accessToken: token });
	}

	return {
		isAuthed: () => { return authenticated; },
		isLoaded: () => { return !!dbx; },
		getAuthLink: () => {
			let redirectUrl;
			if(window.location.href.includes("localhost")) {
				redirectUrl = "http://localhost:8080";
			} else {
				redirectUrl = URL;
			}
			return `https://www.dropbox.com/1/oauth2/authorize?client_id=${CLIENT_ID}`
				+ `&response_type=token&redirect_uri=${redirectUrl}`;
		},
		logout: async () => {
			await dbx.authTokenRevoke();
			if(window.location.href.includes("localhost")) {
				redirectUrl = "http://localhost:8080";
			} else {
				redirectUrl = URL;
			}
			window.location = redirectUrl;
		},
		save: async (data) => {
			let text = serialize(data);
			if(!data.filename) {
				throw "No filename";
			}
			console.log("saving data in " + data.filename);
			let response = await dbx.filesUpload({path: "/" + data.filename, 
					contents: text, 
					mode: "overwrite"});
		},
		delete: function(filename) {

		},
		create: async (title, filename) => {
			let data = new List(title, [], filename);
			let text = serialize(data);
			console.log(`creating new file called '${data.filename}'.`);
			let response = await dbx.filesUpload({path: "/" + datafilename,
				contents: text
			});
		},
		rename: function(oldname, newname) {

		},
		load: async (filename) => {
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
		list: async () =>  {
			let response = await dbx.filesListFolder({path: ''});
			let entries = response.entries.filter((e) => {
				return e[".tag"] == "file";
			}).map((e) => {
				return e.name;
			});
			return entries;
		}
	};
}
