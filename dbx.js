function initializeDropbox() {

	try {
		dbx = new Dropbox({ accessToken: 'K9xgh-zYUYIAAAAAAAAP6ezshMN70ARl32VaKgbQGICweUw05wfwvxKP1QEFbv5q' });
		console.log(dbx.usersGetCurrentAccount());
		dbx.filesListFolder({path: ''})
			.then((response) => {
		  		response.entries.forEach((v, k, l) => {
		  			console.log(v.name);
		  		});
			}).catch(error);
	} catch (e) {
		console.log(e);
	}

	function setupTest() {
		const li3 = new ListItem("support drag", 1, new Date(), INCOMPLETE);
		const li4 = new ListItem("priorities", 2, new Date(), INCOMPLETE);
		const li5 = new ListItem("multiple lists", 3, new Date(), INCOMPLETE);
		const li6 = new ListItem("help menu", 5, new Date(2017, 9, 1), COMPLETE);
		const li7 = new ListItem("dropbox integration", 10, new Date(2017, 8, 1), CANCELLED);
		const list1 = new List("To-do", [li3, li4, li5, li6, li7]);
		lists.push(list1);
		activeList = list1;
	}

	setupTest();
}