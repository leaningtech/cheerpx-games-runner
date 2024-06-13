var cheerpOSFds = [];
var port = null;
var cx = null;
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
		// TODO: Progress report
		var tmp = new Int8Array(data.value);
		await cheerpOSWriteWrapper(fd, tmp, 0, tmp.length);
	}
	cheerpOSCloseWrapper(fd);
}
function sendStatus(status)
{
	port.postMessage({type: "status", status: status});
}
async function handleMessage(m)
{
	var data = m.data;
	if(data.type == "port")
	{
		port = data.port;
		port.onmessage = handleMessage;
		await CheerpXApp.promise;
		cx = await CheerpXApp.create({devices:[{type:"bytes",url:"https://127.0.0.1:8083/debian_run_games.ext2",name:"block1"}],mounts:[{type:"ext2",dev:"block1",path:"/"},{type:"cheerpOS",dev:"/files",path:"/files"}]});
		sendStatus("CheerpX ready");
		port.postMessage({type: "response", responseId: data.responseId, value: null});
	}
	else if(data.type == "install")
	{
		var gameId = data.gameId;
		var r = await fetch(`https://www.gog.com/account/gameDetails/${gameId}.json`);
		var d = await r.json();
		// TODO: How to parse this structure
		var winInstallerUrl = d.downloads[0][1].windows[0].manualUrl;
		await downloadInstaller("https://www.gog.com" + winInstallerUrl, "/files/installer.exe");
		sendStatus("Installer downloaded");
		debugger;
		cx.run("/bin/ls", ["-l", "/files/installer.exe"]);
		debugger;
	}
}
addEventListener("message", handleMessage);
//var cx = await CheerpXSystem.create();
