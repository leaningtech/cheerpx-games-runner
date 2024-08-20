var pendingMessages = [];
// TODO: Get rid of these globals
var cxLinuxChannel = new MessageChannel();
var cxLinuxPort = cxLinuxChannel.port1;
cxLinuxPort.onmessage = cxMsg;
var cxFullSysChannel = new MessageChannel();
var cxFullSysPort = cxFullSysChannel.port1;
cxFullSysPort.onmessage = cxMsg;
var supportedGamesList = null;
var freeGamesList = null;
var unsupportedGamesList = null;
var selectedGameList = null;
// This is the top-level div on the right-hand side
var gamesList = null;
var stopLoading = false;
function GamesList(parent, title, tooltip, isClickable)
{
	this.listDiv = document.createElement("div");
	this.listDiv.classList.add("itemList");
	// Keep the list hidden at first, we want to only display it
	// when the first element is added
	this.listDiv.classList.add("hidden");
	this.listDiv.title = tooltip;
	var titleElem = document.createElement("h2");
	titleElem.textContent = title;
	this.listDiv.appendChild(titleElem);
	this.isClickable = isClickable;
	parent.appendChild(this.listDiv);
}
function createGameDiv(id, title, imgUrl)
{
	var d = document.createElement("div");
	d.setAttribute("data-id", id);
	d.classList.add("game");
	if(this.isClickable)
		d.classList.add("clickable");
	else
		d.classList.add("grayed");
	var i = document.createElement("img");
	// Add a prefix to allow interception by service worker
	i.src = "@" + imgUrl;
	d.appendChild(i);
	var t = document.createElement("span");
	t.textContent = title;
	d.appendChild(t);
	this.listDiv.appendChild(d);
	// Since we are adding an element, make the list visible
	this.listDiv.classList.remove("hidden");
}
GamesList.prototype.addGame = createGameDiv;
function showStatus(message, progressType)
{
	var statusMessage = document.getElementById("statusMessage");
	statusMessage.textContent = message;
	var progressBar = document.getElementById("progress");
	var progressFiller = document.getElementById("progressfiller");
	var loading = document.getElementById("spinner");
	// Disable everything and re-enable what we need
	progressBar.classList.add("hidden");
	progressFiller.classList.add("hidden");
	loading.classList.add("hidden");
	switch(progressType)
	{
		case "none":
			progressFiller.classList.remove("hidden");
			break;
		case "progressbar":
			progressBar.classList.remove("hidden");
			break;
		case "spinner":
			loading.classList.remove("hidden");
			break;
		default:
			console.warn("Unexpected progress type", data.progress);
			break;
	}
}
function cxMsg(m)
{
	var data = m.data;
	if(data.type == "response")
	{
		// Generic code path to get results via messages
		var cb = pendingMessages[data.responseId];
		pendingMessages[data.responseId] = null;
		cb(data.value);
	}
	else if(data.type == "status")
	{
		showStatus(data.status, data.progress);
	}
	else if(data.type == "progress")
	{
		if(data.total > 0)
		{
			var perc = Math.floor(data.value * 100 / data.total).toString() + "%";
			document.getElementById("progressinner").style.width = perc;
		}
		else
		{
			// TODO: Support showing just the downloaded size
		}
	}
	else
	{
		debugger;
	}
}
function allocatePendingMessageId(cb)
{
	var ret = pendingMessages.indexOf(null);
	if(ret < 0)
		ret = pendingMessages.length;
	pendingMessages[ret] = cb;
	return ret;
}
async function sendMessageAndWaitReply(port, msg)
{
	return new Promise(function (f, r)
	{
		var responseId = allocatePendingMessageId(f);
		msg.responseId = responseId;
		port.postMessage(msg);
	});
}
async function getGameData(id)
{
	// Return cached information if we can
	var cachedData = localStorage.getItem(id);
	if(cachedData != null)
		return JSON.parse(cachedData);
	var r = await fetch(`https://api.gog.com/v2/games/${id}`);
	if(r.status != 200)
		return null;
	try
	{
		var gameData = await r.json();
		if(stopLoading)
			return null;
		var productType = gameData._embedded.productType;
		// Ignore product types we don't know about
		switch(productType)
		{
			case "GAME":
			case "PACK":
			case "DLC":
				break;
			default:
				return null;
		}
		// Save the information we need for this game
		var title = gameData._embedded.product.title;
		var imgUrl = gameData._embedded.product._links.image.href.replace("{formatter}", "glx_logo_2x");
		var isUsingDosBox = gameData.isUsingDosBox;
		var dateObj = new Date(gameData._embedded.product.globalReleaseDate);
		// Save the year, we will use it in the future to enable more games as CheerpX improves
		// Initialize the configuration to run the game to null, it will be populated after installation
		var ret = {productType: productType, title: title, imgUrl: imgUrl, isUsingDosBox: isUsingDosBox, releaseYear: dateObj.getFullYear(), gameConfig: null};
		localStorage.setItem(id, JSON.stringify(ret));
		return ret;
	}
	catch(e)
	{
		// Be robust to unexpected formats
		console.warn(`Cannot parse data for game ${id}`);
	}
	return null;
}
async function getGamesData()
{
	try
	{
		// Get the list of all purchased games
		var r = await fetch("https://menu.gog.com/v1/account/licences", { credentials: "include" });
		if(r.status == 401)
			return false;
		gamesList.classList.remove("hidden");
		var licenses = await r.json();
		for(var i=0;i<licenses.length;i++)
		{
			var id = licenses[i];
			var gameData = await getGameData(id);
			if(stopLoading)
				break;
			if(gameData == null)
				continue;
			// Only add full games to the list
			if(gameData.productType != "GAME")
				continue;
			// Only DosBOX games are supported for now
			if(gameData.isUsingDosBox)
				supportedGamesList.addGame(id, gameData.title, gameData.imgUrl);
			else
				unsupportedGamesList.addGame(id, gameData.title, gameData.imgUrl);
		}
	}
	catch(e)
	{
		debugger;
	}
	return true;
}
function getAncestorWithAttribute(elem, attr)
{
	while(elem.getAttribute(attr) == null)
	{
		elem = elem.parentElement;
		if(elem == null)
			return null;
	}
	return elem;
}
async function handleGameStart(ev)
{
	var gameElem = getAncestorWithAttribute(ev.target, "data-id");
	if(gameElem == null)
		return;
	// Prevent further games to be loaded
	stopLoading = true;
	supportedGamesList.listDiv.classList.add("hidden");
	freeGamesList.listDiv.classList.add("hidden");
	unsupportedGamesList.listDiv.classList.add("hidden");
	selectedGameList.listDiv.classList.remove("hidden");
	gameElem.classList.remove("clickable");
	selectedGameList.listDiv.appendChild(gameElem);
	gamesList.classList.add("vcenter");
	var id = gameElem.getAttribute("data-id");
	// Game data _must_ be stored in the localStorage already
	var gameData = JSON.parse(localStorage.getItem(id));
	if(gameData.gameConfig == null)
	{
		showStatus("Installing the game", "none");
		linuxIframe = await initCheerpXLinux();
		var gameConfig = await sendMessageAndWaitReply(cxLinuxPort, {type: "install", gameId: id});
		linuxIframe.remove();
		if(gameConfig == null)
		{
			showStatus("Installation failure, reload the page to try another game", "none");
			return;
		}
		gameData.gameConfig = gameConfig;
		// Update cached data to include the config
		localStorage.setItem(id, JSON.stringify(gameData));
	}
	await initCheerpXFullSys();
	await sendMessageAndWaitReply(cxFullSysPort, {type: "start", gameConfig: gameData.gameConfig});
debugger;
}
function handleLinkElement(ev)
{
	var linkElem = getAncestorWithAttribute(ev.target, "data-id");
	if(linkElem == null)
		return;
	var link = linkElem.getAttribute("data-id");
	window.open(link, "_blank");
}
async function initCheerpXLinux()
{
	return new Promise(function(f, r)
	{
		var i = document.createElement("iframe");
		i.onload = function()
		{
			var responseId = allocatePendingMessageId(function()
			{
				f(i);
			});
			i.contentWindow.postMessage({type: "port", port: cxLinuxChannel.port2, responseId: responseId}, "*", [cxLinuxChannel.port2]);
		};
		i.src = "/cxlinux.html"
		i.style.display = "none";
		document.body.appendChild(i);
	});
}
async function initCheerpXFullSys()
{
	return new Promise(function(f, r)
	{
		var i = document.createElement("iframe");
		i.id = "cxfullsys";
		i.onload = function()
		{
			var responseId = allocatePendingMessageId(f);
			i.contentWindow.postMessage({type: "port", port: cxFullSysChannel.port2, responseId: responseId}, "*", [cxFullSysChannel.port2]);
		};
		i.src = "/cxfullsys.html"
		document.body.appendChild(i);
	});
}
async function init(){
	gamesList = document.getElementById("gamesList");
	// The list of supported games, clickable
	supportedGamesList = new GamesList(gamesList, "Supported games", "Select a game to play", /*isClickable*/true);
	// Direct link to the free games selection for supported stores
	freeGamesList = new GamesList(gamesList, "Get more games", "Visit store", /*isClickable*/true);
	freeGamesList.addGame("https://www.gog.com/en/games?priceRange=0,0&hideDLCs=true&releaseDateRange=1980,1999", "Free games on GOG.com", "gogassets/logo.png");
	// The list of unsupported games, not clickable and grayed out
	unsupportedGamesList = new GamesList(gamesList, "Unsupported games", "Not currently supported", /*isClickable*/false);
	// This 'list' only ever contains a single game
	selectedGameList = new GamesList(gamesList, "Selected game", "Selected game", /*isClickable*/true);
	selectedGameList.listDiv.classList.add("hidden");
	showStatus("Loading games", "spinner");
	supportedGamesList.listDiv.addEventListener("click", handleGameStart);
	freeGamesList.listDiv.addEventListener("click", handleLinkElement);
	var hasGamesData = await getGamesData();
	if(hasGamesData)
	{
		if(!stopLoading)
			showStatus("Click on a game to play", "none");
	}
	else
	{
		var storeList = document.getElementById("storeList");
		var supportedStoreList = new GamesList(storeList, "Supported stores", "Select a store to login", /*isClickable*/true);
		supportedStoreList.addGame("https://www.gog.com/en/##openlogin", "Login to GOG.com", "gogassets/logo.png");
		supportedStoreList.listDiv.addEventListener("click", handleLinkElement);
		showStatus("Reload page after logging in", "none");
		storeList.classList.remove("hidden");
	}
}
document.addEventListener("DOMContentLoaded", init);
