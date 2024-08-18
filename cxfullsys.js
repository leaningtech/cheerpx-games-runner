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
		await CheerpXSystem.promise;
		cx = await CheerpXSystem.create();
		port.postMessage({type: "response", responseId: data.responseId, value: null});
	}
	else if(data.type == "start")
	{
		gameConfig = data.gameConfig;
		// Acquire focus to make sure we receive keyboard events
		window.focus();
		cx.run(/*MhZ*/20, {mem:64, bios:"/files/bios.bin", vgaBios:"/files/vgabios-stdvga.bin", disk:gameConfig.dosImage, cd:gameConfig.cdImage});
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
