var cheerpOSFds = [];
var port = null;
var cx = null;
var dataDevice = null;
async function downloadInstaller(url, dataPath, reportProgress)
{
	var response = await fetch(url);
	var fileLengthStr = response.headers.get("Content-Length");
	var fileLength = -1;
	if(fileLengthStr)
		fileLength = parseInt(fileLengthStr);
	var reader = response.body.getReader();
	var curLength = 0;
	var chunks = [];
	while(1)
	{
		var data = await reader.read();
		if(data.done)
			break;
		curLength += data.value.byteLength;
		if(reportProgress)
			port.postMessage({type: "progress", value: curLength, total:  fileLength});
		chunks.push(new Uint8Array(data.value));
	}
	var buf = new Uint8Array(curLength);
	curLength = 0;
	for(var i=0;i<chunks.length;i++)
	{
		var b = chunks[i];
		buf.set(b, curLength);
		curLength += b.length;
	}
	dataDevice.writeFile(dataPath, buf);
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
		await CheerpX.Linux.promise;
		var idbDevice = await CheerpX.IDBDevice.create("files");
		var overlayDevice = await CheerpX.OverlayDevice.create(await CheerpX.CloudDevice.create("https://disks.webvm.io/debian_cxgr_20240807.ext2"), await CheerpX.IDBDevice.create("block1"));
		dataDevice = await CheerpX.DataDevice.create();
		cx = await CheerpX.Linux.create({mounts:[{type:"ext2",dev:overlayDevice,path:"/"},{type:"tree",dev:idbDevice,path:"/files"},{type:"tree",dev:dataDevice,path:"/data"},{type:"devs",path:"/dev"}]});
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
	await downloadInstaller("/autoexec_parse.py", "/autoexec_parse.py", /*reportProgress*/false);
	await downloadInstaller("https://www.gog.com" + winInstallerUrl, "/installer.exe", /*reportProgress*/true);
	sendStatus("Downloading DOS image", "spinner");
	await downloadInstaller("/freedos.img", "/freedos.img", /*reportProgress*/false);
	// TODO: Copy only once
	await downloadInstaller("/bios.bin", "/bios.bin", /*reportProgress*/false);
	await downloadInstaller("/vgabios-stdvga.bin", "/vgabios-stdvga.bin", /*reportProgress*/false);
	// Copy the BIOS images to persistent storage
	var ret = await cx.run("/bin/cp", ["-v", "/data/bios.bin", `/files/bios.bin`]);
	if(ret.status != 0)
		return null;
	var ret = await cx.run("/bin/cp", ["-v", "/data/vgabios-stdvga.bin", `/files/vgabios-stdvga.bin`]);
	if(ret.status != 0)
		return null;
	sendStatus("Extracting game data", "spinner");
	var ret = await cx.run("/usr/bin/innoextract", ["-m", "-d", `/files/${gameId}/`, "/data/installer.exe"]);
	if(ret.status != 0)
		return null;
	// This copy seems to be hardcoded, even if there are mechanisms such as the game script that would support this copy
	var ret = await cx.run("/usr/bin/test", ["-d", `/files/${gameId}/__support/save/`]);
	if(ret.status == 0)
	{
		var ret = await cx.run("/bin/cp", ["-rv", `/files/${gameId}/__support/save/.`, `/files/${gameId}`]);
		if(ret.status != 0)
			return null;
	}
	sendStatus("Copying game data", "spinner");
	// Edit the standard FreeDOS setup to immediately start in safe mode
	// NOTE: FreeDOS uses a traditional 63 sector start location
	var freedosStart = 63 * 512;
	// Copy the image to a R/W filesystem
	var ret = await cx.run("/bin/cp", ["-v", "/data/freedos.img", `/files/${gameId}_c.img`]);
	if(ret.status != 0)
		return null;
	// Use a python script to parse the configuration and copy the right files
	var ret = await cx.run("/usr/bin/python3", ["/data/autoexec_parse.py", `/files/${gameId}`, `/files/${gameId}_c.img@@${freedosStart}`, "/tmp/autoexec.bat"]);
	if(ret.status != 0)
		return null;
	// We need a customized copy of the DOS setup for the custom autoexec
	sendStatus("Setting up DOS", "spinner");
	var ret = await cx.run("/usr/bin/mcopy", ["-i", `/files/${gameId}_c.img@@${freedosStart}`, "-v", "::FDCONFIG.SYS", "/tmp/FDCONFIG.SYS"]);
	if(ret.status != 0)
		return null;
	var ret = await cx.run("/bin/sed", ["-i", "s/MENUDEFAULT=2,5/MENUDEFAULT=4,0/", "/tmp/FDCONFIG.SYS"]);
	if(ret.status != 0)
		return null;
	var ret = await cx.run("/usr/bin/mdel", ["-i", `/files/${gameId}_c.img@@${freedosStart}`, "-v", "::FDCONFIG.SYS"]);
	if(ret.status != 0)
		return null;
	var ret = await cx.run("/usr/bin/mcopy", ["-i", `/files/${gameId}_c.img@@${freedosStart}`, "-v", "/tmp/FDCONFIG.SYS", "::FDCONFIG.SYS"]);
	if(ret.status != 0)
		return null;
	// Copy generated autoexec.bat the end of original fdauto.bat
	var ret = await cx.run("/usr/bin/mcopy", ["-i", `/files/${gameId}_c.img@@${freedosStart}`, "-v", "::FDAUTO.BAT", "/tmp/FDAUTO.BAT"]);
	if(ret.status != 0)
		return null;
	var ret = await cx.run("/bin/bash", ["-c", "cat /tmp/FDAUTO.BAT /tmp/autoexec.bat > /tmp/FDAUTO.NEW.BAT"]);
	if(ret.status != 0)
		return null;
	var ret = await cx.run("/usr/bin/mdel", ["-i", `/files/${gameId}_c.img@@${freedosStart}`, "-v", "::FDAUTO.BAT"]);
	if(ret.status != 0)
		return null;
	var ret = await cx.run("/usr/bin/mcopy", ["-i", `/files/${gameId}_c.img@@${freedosStart}`, "-v", "/tmp/FDAUTO.NEW.BAT", "::FDAUTO.BAT"]);
	if(ret.status != 0)
		return null;
	sendStatus("Cleaning up", "spinner");
	var ret = await cx.run("/bin/rm", ["-rf", `/files/${gameId}/`, "/files/installer.exe", "/tmp/FDCONFIG.SYS", "/tmp/FDAUTO.BAT", "/tmp/FDAUTO.NEW.BAT"]);
	if(ret.status != 0)
		return null;
	var cdImage = null;
	if((await cx.run("/usr/bin/test", ["-f", `/files/${gameId}_d.iso`])).status == 0)
		cdImage = `${gameId}_d.iso`;
	await cx.flushIO();
	return {dosImage: `${gameId}_c.img`, cdImage: cdImage};
}
addEventListener("message", handleMessage);
