async function getGamesData()
{
	// TODO: Cache data and only update new entries in licenses
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
			gamesList.appendChild(createGameDiv(id, title, imgUrl));
		}
	}
	catch(e)
	{
		debugger;
	}
}
async function handleGameStart(ev)
{
	var id = ev.currentTarget.getAttribute("data-id");
	var r = await fetch(`https://www.gog.com/account/gameDetails/${id}.json`);
	var d = await r.json();
	// TODO: Download Windows installer
}
function createGameDiv(id, title, imgUrl)
{
	var d = document.createElement("div");
	d.setAttribute("data-id", id);
	d.addEventListener("click", handleGameStart);
	var i = document.createElement("img");
	// Add a prefix to allow interception by service worker
	i.src = "@" + imgUrl;
	d.appendChild(i);
	var t = document.createElement("span");
	t.textContent = title;
	d.appendChild(t);
	return d;
}
async function init(){
	var gamesList = document.getElementById("gamesList");
	await getGamesData();
	var loading = document.getElementById("gamesLoading");
	loading.style.display = "none";
}
document.addEventListener("DOMContentLoaded", init);
