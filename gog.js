(async function(){
	async function getGamesData()
	{
		chrome.runtime.sendMessage({type: "enableTab"});
		// TODO: Cache data and only update new entries in licenses
		var supportedGames = [];
		try
		{
			// Get the list of all purchased games
			var r = await fetch("https://menu.gog.com/v1/account/licences", { credentials: "include" });
			var licenses = await r.json();
			for(var i=0;i<licenses.length;i++)
			{
				var id = licenses[i];
				var r = await fetch(`https://api.gog.com/v2/games/${id}`);
				var gameData = await r.json();
				// Only consider DOSBox games for now
				if(!gameData.isUsingDosBox)
					continue;
				// Save the information we need for this game
				var title = gameData._embedded.product.title;
				var imgUrl = gameData._embedded.product._links.image.href.replace("{formatter}", "glx_logo_2x");
				supportedGames.push({id, title, imgUrl});
			}
		}
		catch(e)
		{
			debugger;
		}
		return supportedGames;
	}
	function createGameDiv(gameData)
	{
		var d = document.createElement("div");
		var i = document.createElement("img");
		i.src = gameData.imgUrl;
		d.appendChild(i);
		var t = document.createElement("span");
		t.textContent = gameData.title;
		d.appendChild(t);
		return d;
	}
	var supportedGames = await getGamesData();
	var loading = document.getElementById("gamesLoading");
	loading.style.display = "none";
	var gamesList = document.getElementById("gamesList");
	for(var i=0;i<supportedGames.length;i++)
		gamesList.appendChild(createGameDiv(supportedGames[i]));
})()
