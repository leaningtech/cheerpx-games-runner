async function getGamesData()
{
	var gamesList = document.getElementById("gamesList");
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
var cheerpOSFds = [];
async function cheerpOSOpenWrapper(path, mode)
{
	return new Promise(function(resolve, reject)
	{
		cheerpOSOpen(cheerpOSFds, path, mode, resolve);
	});
}
async function cheerpOSWriteWrapper(fd, buf, off, len)
{
	return new Promise(function(resolve, reject)
	{
		cheerpOSWrite(cheerpOSFds, fd, buf, off, len, resolve)
	});
}
async function cheerpOSCloseWrapper(fd)
{
	return cheerpOSClose(cheerpOSFds, fd);
}
async function downloadInstaller(url, cheerpOSPath)
{
	var fd = await cheerpOSOpenWrapper(cheerpOSPath, "w");
	var response = await fetch(url);
	var fileLengthStr = response.headers.get("Content-Length");
	var fileLength = -1;
	if(fileLengthStr)
		fileLength = parseInt(fileLengthStr);
	var reader = response.body.getReader();
	while(1)
	{
		var data = await reader.read();
		if(data.done)
			break;
		var tmp = new Int8Array(data.value);
		await cheerpOSWriteWrapper(fd, tmp, 0, tmp.length);
	}
	cheerpOSCloseWrapper(fd);
}
async function handleGameStart(ev)
{
	var id = ev.currentTarget.getAttribute("data-id");
	var r = await fetch(`https://www.gog.com/account/gameDetails/${id}.json`);
	var d = await r.json();
	// TODO: How to parse this structure
	var winInstallerUrl = d.downloads[0][1].windows[0].manualUrl;
	await downloadInstaller("https://www.gog.com" + winInstallerUrl, "/files/installer.exe");
	debugger;
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
async function initCheerpX()
{
	var cx = await CheerpXSystem.create();
}
async function init(){
	var statusMessage = document.getElementById("statusMessage");
	statusMessage.textContent = "Initializing CheerpX";
	var sandboxInitPromise = initCheerpX();
	var gamesDataPromise = getGamesData();
	// We expect the VM to be initialized first
	await sandboxInitPromise;
	statusMessage.textContent = "Loading games";
	await gamesDataPromise;
	statusMessage.textContent = "Click on a game to play";
	var loading = document.getElementById("spinner");
	loading.style.display = "none";
}
document.addEventListener("DOMContentLoaded", init);
