var port = null;
var cx = null;
var gameConfig = null;
async function handleMessage(m)
{
	var data = m.data;
	if(data.type == "port")
	{
		port = data.port;
		port.onmessage = handleMessage;
		await CheerpX.System.promise;
		cx = await CheerpX.System.create();
		port.postMessage({type: "response", responseId: data.responseId, value: null});
	}
	else if(data.type == "start")
	{
		gameConfig = data.gameConfig;
		// Acquire focus to make sure we receive keyboard events
		window.focus();
		var idbDevice = await CheerpX.IDBDevice.create("files");
		var sysOpts = {
			MhZ:20,
			mem:64,
			bios:await CheerpX.FileDevice.create(idbDevice, "bios.bin"),
			vgaBios:await CheerpX.FileDevice.create(idbDevice, "vgabios-stdvga.bin"),
			disks:[{dev:await CheerpX.FileDevice.create(idbDevice, gameConfig.dosImage), type:"ata"}]
		}
		if (gameConfig.cdImage)
			sysOpts.disks.push({dev: await CheerpX.FileDevice.create(idbDevice, gameConfig.cdImage), type:"atapi"})
		cx.run(sysOpts);
	}
	else
	{
		debugger;
	}
}
function exportGameImage(imgFile)
{
	cheerpOSGetFileBlob([], imgFile, function(b)
	{
		var url = URL.createObjectURL(b);
		var a = document.createElement("a");
		a.href = url;
		a.download = imgFile.split("/").pop();
		a.click();
		URL.revokeObjectURL(b);
	})
}
function exportGameImages()
{
	exportGameImage(gameConfig.dosImage);
	if(gameConfig.cdImage)
		exportGameImage(gameConfig.cdImage);
}
addEventListener("message", handleMessage);
