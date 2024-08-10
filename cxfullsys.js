var port = null;
var cx = null;
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
		var gameConfig = data.gameConfig;
		cx.run(/*MhZ*/20, {mem:64, bios:"/files/bios.bin", vgaBios:"/files/vgabios-stdvga.bin", disk:gameConfig.dosImage});
	}
	else
	{
		debugger;
	}
}
addEventListener("message", handleMessage);
