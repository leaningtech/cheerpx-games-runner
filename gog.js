var pendingMessages = [];
// TODO: Get rid of these globals
var cxLinuxChannel = new MessageChannel();
var cxLinuxPort = cxLinuxChannel.port1;
cxLinuxPort.onmessage = cxMsg;
var cxFullSysChannel = new MessageChannel();
var cxFullSysPort = cxFullSysChannel.port1;
cxFullSysPort.onmessage = cxMsg;
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
async function handleGameStart(ev)
{
	var id = ev.currentTarget.getAttribute("data-id");
	var gameConfig = localStorage.getItem(id);
	if(gameConfig == null)
	{
		var statusMessage = document.getElementById("statusMessage");
		statusMessage.textContent = "Installing the game";
		await initCheerpXLinux();
		gameConfig = await sendMessageAndWaitReply(cxLinuxPort, {type: "install", gameId: id});
		// TODO: Remove Linux mode iframe
		localStorage.setItem(id, JSON.stringify(gameConfig));
	}
	else
	{
		gameConfig = JSON.parse(gameConfig);
	}
	await initCheerpXFullSys();
	await sendMessageAndWaitReply(cxFullSysPort, {type: "start", gameConfig: gameConfig});
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
	var statusMessage = document.getElementById("statusMessage");
	statusMessage.textContent = "Loading games";
	var gamesData = await getGamesData();
	statusMessage.textContent = "Click on a game to play";
	var loading = document.getElementById("spinner");
	loading.style.display = "none";
}
document.addEventListener("DOMContentLoaded", init);
