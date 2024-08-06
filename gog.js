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
		var statusMessage = document.getElementById("statusMessage");
		statusMessage.textContent = data.status;
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
async function getGamesData(gamesList)
{
	// TODO: Cache data and only update new entries in licences
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
			var r = await fetch(`https://api.gog.com/v2/games/${id}`);
			if(r.status != 200)
				continue;
			try
			{
				var gameData = await r.json();
				if(gameData._embedded.productType != "GAME")
					continue;
				// Save the information we need for this game
				var title = gameData._embedded.product.title;
				var imgUrl = gameData._embedded.product._links.image.href.replace("{formatter}", "glx_logo_2x");
				// Only DosBOX games are supported for now
				if(gameData.isUsingDosBox)
					supportedGamesList.addGame(id, title, imgUrl);
				else
					unsupportedGamesList.addGame(id, title, imgUrl);
			}
			catch(e)
			{
				// Be robust to unexpected formats
				console.warn(`Cannot parse data for game ${id}`);
			}
			if(stopLoading)
				break;
		}
	}
	catch(e)
	{
		debugger;
	}
	return true;
}
function getAttributeFromAncestor(elem, attr)
{
	var ret = null;
	while((ret = elem.getAttribute(attr)) == null)
		elem = elem.parentElement;
	return ret;
}
async function handleGameStart(ev)
{
	// Prevent further games to be loaded
	stopLoading = true;
	var id = getAttributeFromAncestor(ev.target, "data-id");
	var gameConfig = localStorage.getItem(id);
	if(gameConfig == null)
	{
		var statusMessage = document.getElementById("statusMessage");
		statusMessage.textContent = "Installing the game";
		linuxIframe = await initCheerpXLinux();
		gameConfig = await sendMessageAndWaitReply(cxLinuxPort, {type: "install", gameId: id});
		localStorage.setItem(id, JSON.stringify(gameConfig));
		linuxIframe.remove();
	}
	else
	{
		gameConfig = JSON.parse(gameConfig);
	}
	await initCheerpXFullSys();
	await sendMessageAndWaitReply(cxFullSysPort, {type: "start", gameConfig: gameConfig});
debugger;
}
function handleLinkElement(ev)
{
	var link = getAttributeFromAncestor(ev.target, "data-id");
	window.open(link, "_blank");
}
async function initCheerpXLinux()
{
	return new Promise(function(f, r)
	{
		var i = document.createElement("iframe");
		i.onload = function()
		{
			var responseId = allocatePendingMessageId(f);
			i.contentWindow.postMessage({type: "port", port: cxLinuxChannel.port2, responseId: responseId}, "*", [cxLinuxChannel.port2]);
		};
		i.src = "/cxlinux.html"
		i.style.display = "none";
		document.body.appendChild(i);
		f(i);
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
	var gamesList = document.getElementById("gamesList");
	// The list of supported games, clickable
	supportedGamesList = new GamesList(gamesList, "Supported games", "Select a game to play", /*isClickable*/true);
	// Direct link to the free games selection for supported stores
	freeGamesList = new GamesList(gamesList, "Get more games", "Visit store", /*isClickable*/true);
	freeGamesList.addGame("https://www.gog.com/en/games?priceRange=0,0&hideDLCs=true&releaseDateRange=1980,1999", "Free games on GOG.com", "gogassets/logo.png");
	// The list of unsupported games, not clickable and grayed out
	unsupportedGamesList = new GamesList(gamesList, "Unsupported games", "Not currently supported", /*isClickable*/false);
	var statusMessage = document.getElementById("statusMessage");
	statusMessage.textContent = "Loading games";
	supportedGamesList.listDiv.addEventListener("click", handleGameStart);
	freeGamesList.listDiv.addEventListener("click", handleLinkElement);
	var hasGamesData = await getGamesData(gamesList);
	if(hasGamesData)
	{
		statusMessage.textContent = "Click on a game to play";
	}
	else
	{
		var storeList = document.getElementById("storeList");
		var supportedStoreList = new GamesList(storeList, "Supported stores", "Select a store to login", /*isClickable*/true);
		supportedStoreList.addGame("https://www.gog.com/en/##openlogin", "Login to GOG.com", "gogassets/logo.png");
		supportedStoreList.listDiv.addEventListener("click", handleLinkElement);
		statusMessage.textContent = "Reload page after logging in";
		storeList.classList.remove("hidden");
	}
	var loading = document.getElementById("spinner");
	loading.style.display = "none";
}
document.addEventListener("DOMContentLoaded", init);
