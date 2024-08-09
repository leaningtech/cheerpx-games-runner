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
		sendStatus("CheerpX ready");
		port.postMessage({type: "response", responseId: data.responseId, value: null});
	}
	else if(data.type == "install")
	{
		var success = await installGame(data.gameId);
		// An empty response encodes a failure
		port.postMessage({type: "response", responseId: data.responseId, value: success ? {dosImage: `/files/${gameId}_c.img`, gameImage: `/files/${gameId}_d.img`} : null});
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
	sendStatus("Downloading installer");
	await downloadInstaller("/autoexec_parse.py", "/files/autoexec_parse.py");
	await downloadInstaller("https://www.gog.com" + winInstallerUrl, "/files/installer.exe");
	sendStatus("Downloading DOS image");
	await downloadInstaller("/freedos.img", `/files/${gameId}_c.img`);
	// TODO: Copy only once
	await downloadInstaller("/bios.bin", "/files/bios.bin");
	await downloadInstaller("/vgabios-stdvga.bin", "/files/vgabios-stdvga.bin");
	sendStatus("Extracting game data");
	var ret = await cx.run("/usr/bin/innoextract", ["-m", "-d", `/files/${gameId}/`, "/files/installer.exe"]);
	if(ret != 0)
		return false;
	sendStatus("Formatting image");
	// TODO: Support /dev/zero in CheerpX
	// Create an empty image 20% larger than the strictly required size
	var ret = await cx.run("/bin/bash", ["-c", `dd if=/dev/urandom of=/files/${gameId}_d.img bs=1M count=$((\`du --apparent-size -sm /files/${gameId}/ | cut -f 1\` * 12 / 10))`]);
	if(ret != 0)
		return false;
	var ret = await cx.run("/bin/bash", ["-c", `echo -e "n\\np\\n1\\n\\n\\nt\\n6\\nw" | /sbin/fdisk /files/${gameId}_d.img`]);
	if(ret != 0)
		return false;
	// Format the partition inside the image, assume the starting point is always 1M / 2048 sectors
	var ret = await cx.run("/usr/bin/mformat", ["-i", `/files/${gameId}_d.img@@1048576`]);
	if(ret != 0)
		return false;
	sendStatus("Copying game data");
	// Use a python script to parse the configuration and copy the right files
	var ret = await cx.run("/usr/bin/python3", ["/files/autoexec_parse.py", `/files/${gameId}`, `/files/${gameId}_d.img@@1048576`, "/tmp/autoexec.bat"]);
	if(ret != 0)
		return false;
	// We need a customized copy of the DOS setup for the custom autoexec
	sendStatus("Setting up DOS");
	// Edit the standard FreeDOS setup to immediately start in safe mode
	// NOTE: FreeDOS uses a traditional 63 sector start location
	var freedosStart = 63 * 512;
	var ret = await cx.run("/usr/bin/mcopy", ["-i", `/files/${gameId}_c.img@@${freedosStart}`, "-v", "::FDCONFIG.SYS", "/tmp/FDCONFIG.SYS"]);
	if(ret != 0)
		return false;
	var ret = await cx.run("/bin/sed", ["-i", "s/MENUDEFAULT=2,5/MENUDEFAULT=4,0/", "/tmp/FDCONFIG.SYS"]);
	if(ret != 0)
		return false;
	var ret = await cx.run("/usr/bin/mdel", ["-i", `/files/${gameId}_c.img@@${freedosStart}`, "-v", "::FDCONFIG.SYS"]);
	if(ret != 0)
		return false;
	var ret = await cx.run("/usr/bin/mcopy", ["-i", `/files/${gameId}_c.img@@${freedosStart}`, "-v", "/tmp/FDCONFIG.SYS", "::FDCONFIG.SYS"]);
	if(ret != 0)
		return false;
	// Copy generated autoexec.bat the end of original fdauto.bat
	var ret = await cx.run("/usr/bin/mcopy", ["-i", `/files/${gameId}_c.img@@${freedosStart}`, "-v", "::FDAUTO.BAT", "/tmp/FDAUTO.BAT"]);
	if(ret != 0)
		return false;
	var ret = await cx.run("/bin/bash", ["-c", "cat /tmp/FDAUTO.BAT /tmp/autoexec.bat > /tmp/FDAUTO.NEW.BAT"]);
	if(ret != 0)
		return false;
	var ret = await cx.run("/usr/bin/mdel", ["-i", `/files/${gameId}_c.img@@${freedosStart}`, "-v", "::FDAUTO.BAT"]);
	if(ret != 0)
		return false;
	var ret = await cx.run("/usr/bin/mcopy", ["-i", `/files/${gameId}_c.img@@${freedosStart}`, "-v", "/tmp/FDAUTO.NEW.BAT", "::FDAUTO.BAT"]);
	if(ret != 0)
		return false;
	sendStatus("Cleaning up");
	var ret = await cx.run("/bin/rm", ["-rf", `/files/${gameId}/`, "/files/installer.exe", "/tmp/FDCONFIG.SYS", "/tmp/FDAUTO.BAT", "/tmp/FDAUTO.NEW.BAT"]);
	if(ret != 0)
		return false;
	await cx.flushIO();
	return true;
}
addEventListener("message", handleMessage);
