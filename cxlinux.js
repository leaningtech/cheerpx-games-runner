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
async function downloadInstaller(url, cheerpOSPath, reportProgress)
{
	var fd = await cheerpOSOpenWrapper(cheerpOSPath, "w");
	var response = await fetch(url);
	var fileLengthStr = response.headers.get("Content-Length");
	var fileLength = -1;
	if(fileLengthStr)
		fileLength = parseInt(fileLengthStr);
	var reader = response.body.getReader();
	var curLength = 0;
	while(1)
	{
		var data = await reader.read();
		if(data.done)
			break;
		curLength += data.value.byteLength;
		if(reportProgress)
			port.postMessage({type: "progress", value: curLength, total:  fileLength});
		var tmp = new Int8Array(data.value);
		await cheerpOSWriteWrapper(fd, tmp, 0, tmp.length);
	}
	cheerpOSCloseWrapper(fd);
}
function sendStatus(status, progressType)
{
	port.postMessage({type: "status", status: status, progress: progressType});
}
var consoleDecoder = new TextDecoder('utf-8');
function consoleWrite(buf)
{
	// Decode and print the output to stdout
	console.log(consoleDecoder.decode(buf));
}
async function handleMessage(m)
{
	var data = m.data;
	if(data.type == "port")
	{
		port = data.port;
		port.onmessage = handleMessage;
		await CheerpXApp.promise;
		cx = await CheerpXApp.create({devices:[{type:"block",url:"https://disks.webvm.io/debian_cxgr_20240807.ext2",name:"block1"}],mounts:[{type:"ext2",dev:"block1",path:"/"},{type:"cheerpOS",dev:"/files",path:"/files"},{type:"devs",dev:"",path:"/dev"}]});
		sendStatus("CheerpX ready", "none");
		port.postMessage({type: "response", responseId: data.responseId, value: null});
	}
	else if(data.type == "install")
	{
		var gameId = data.gameId;
		var gameConfig = await installGame(gameId);
		// An empty response encodes a failure
		port.postMessage({type: "response", responseId: data.responseId, value: gameConfig});
	}
	else
	{
		debugger;
	}
}
async function installGame(gameId)
{
	// Initialize the custom console
	var cxReadFunc = cx.setCustomConsole(consoleWrite, 80, 24);
	// We need to inject a single "q\n" to make sure mcopy do not ever hang on duplicated filenames
	cxReadFunc(113);
	cxReadFunc(10);
	var r = await fetch(`https://www.gog.com/account/gameDetails/${gameId}.json`);
	var d = await r.json();
	// TODO: How to parse this structure
	var winInstallerUrl = d.downloads[0][1].windows[0].manualUrl;
	sendStatus("Downloading installer", "progressbar");
	await downloadInstaller("/autoexec_parse.py", "/files/autoexec_parse.py", /*reportProgress*/false);
	await downloadInstaller("https://www.gog.com" + winInstallerUrl, "/files/installer.exe", /*reportProgress*/true);
	sendStatus("Downloading DOS image", "spinner");
	await downloadInstaller("/freedos.img", `/files/${gameId}_c.img`, /*reportProgress*/false);
	// TODO: Copy only once
	await downloadInstaller("/bios.bin", "/files/bios.bin", /*reportProgress*/false);
	await downloadInstaller("/vgabios-stdvga.bin", "/files/vgabios-stdvga.bin", /*reportProgress*/false);
	sendStatus("Extracting game data", "spinner");
	var ret = await cx.run("/usr/bin/innoextract", ["-m", "-d", `/files/${gameId}/`, "/files/installer.exe"]);
	if(ret != 0)
		return null;
	// This copy seems to be hardcoded, even if there are mechanisms such as the game script that would support this copy
	if(await cx.run("/usr/bin/test", ["-d", `/files/${gameId}/__support/save/`]) == 0)
	{
		var ret = await cx.run("/bin/cp", ["-rv", `/files/${gameId}/__support/save/.`, `/files/${gameId}`]);
		if(ret != 0)
			return null;
	}
	sendStatus("Copying game data", "spinner");
	// Edit the standard FreeDOS setup to immediately start in safe mode
	// NOTE: FreeDOS uses a traditional 63 sector start location
	var freedosStart = 63 * 512;
	// Use a python script to parse the configuration and copy the right files
	var ret = await cx.run("/usr/bin/python3", ["/files/autoexec_parse.py", `/files/${gameId}`, `/files/${gameId}_c.img@@${freedosStart}`, "/tmp/autoexec.bat"]);
	if(ret != 0)
		return null;
	// We need a customized copy of the DOS setup for the custom autoexec
	sendStatus("Setting up DOS", "spinner");
	var ret = await cx.run("/usr/bin/mcopy", ["-i", `/files/${gameId}_c.img@@${freedosStart}`, "-v", "::FDCONFIG.SYS", "/tmp/FDCONFIG.SYS"]);
	if(ret != 0)
		return null;
	var ret = await cx.run("/bin/sed", ["-i", "s/MENUDEFAULT=2,5/MENUDEFAULT=4,0/", "/tmp/FDCONFIG.SYS"]);
	if(ret != 0)
		return null;
	var ret = await cx.run("/usr/bin/mdel", ["-i", `/files/${gameId}_c.img@@${freedosStart}`, "-v", "::FDCONFIG.SYS"]);
	if(ret != 0)
		return null;
	var ret = await cx.run("/usr/bin/mcopy", ["-i", `/files/${gameId}_c.img@@${freedosStart}`, "-v", "/tmp/FDCONFIG.SYS", "::FDCONFIG.SYS"]);
	if(ret != 0)
		return null;
	// Copy generated autoexec.bat the end of original fdauto.bat
	var ret = await cx.run("/usr/bin/mcopy", ["-i", `/files/${gameId}_c.img@@${freedosStart}`, "-v", "::FDAUTO.BAT", "/tmp/FDAUTO.BAT"]);
	if(ret != 0)
		return null;
	var ret = await cx.run("/bin/bash", ["-c", "cat /tmp/FDAUTO.BAT /tmp/autoexec.bat > /tmp/FDAUTO.NEW.BAT"]);
	if(ret != 0)
		return null;
	var ret = await cx.run("/usr/bin/mdel", ["-i", `/files/${gameId}_c.img@@${freedosStart}`, "-v", "::FDAUTO.BAT"]);
	if(ret != 0)
		return null;
	var ret = await cx.run("/usr/bin/mcopy", ["-i", `/files/${gameId}_c.img@@${freedosStart}`, "-v", "/tmp/FDAUTO.NEW.BAT", "::FDAUTO.BAT"]);
	if(ret != 0)
		return null;
	sendStatus("Cleaning up", "spinner");
	var ret = await cx.run("/bin/rm", ["-rf", `/files/${gameId}/`, "/files/installer.exe", "/tmp/FDCONFIG.SYS", "/tmp/FDAUTO.BAT", "/tmp/FDAUTO.NEW.BAT"]);
	if(ret != 0)
		return null;
	var cdImage = null;
	if(await cx.run("/usr/bin/test", ["-f", `/files/${gameId}_d.iso`]) == 0)
		cdImage = `/files/${gameId}_d.iso`;
	await cx.flushIO();
	return {dosImage: `/files/${gameId}_c.img`, cdImage: cdImage};
}
addEventListener("message", handleMessage);
