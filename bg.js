function handleClick()
{
	chrome.tabs.create({ url: chrome.runtime.getURL("index.html") });
}
async function handleProxied(url)
{
	var r = await fetch(url);
	var h = new Headers(r.headers);
	h.set("Cross-Origin-Embedder-Policy", "require-corp");
	return new Response(r.body, { status: r.status, headers: h });
}
var cxPublicDeploy = null;
async function handleCX(url)
{
	try
	{
		// Try to fetch CheerpX internally, this will always succeedd on the
		// Chrome Store version of the extension
		var cxInternalPrefix = chrome.runtime.getURL("cxinternal");
		var r = await fetch(cxInternalPrefix + url);
		return r;
	}
	catch(e)
	{
		// Download from a public deployment, only for development purposes
		if(cxPublicDeploy == null)
		{
			var r = await fetch("https://cheerpxdemos.leaningtech.com/publicdeploy/LATEST.txt");
			var cxUrl = await r.text();
			cxPublicDeploy = cxUrl.substring(0, cxUrl.length - "/cx.js\n".length);
		}
		var r = await fetch(cxPublicDeploy + url);
		return new Response(r.body, { status: r.status, headers: r.headers });
	}
}
function handleFetch(ev)
{
	var url = ev.request.url;
	var proxyPrefix = chrome.runtime.getURL("@");
	var cxPrefix = chrome.runtime.getURL("cxpublic");
	if(url.startsWith(proxyPrefix))
	{
		url = url.substring(proxyPrefix.length);
		ev.respondWith(handleProxied(url));
	}
	else if(url.startsWith(cxPrefix))
	{
		// Return data from the package if available, use a public deployment otherwise
		url = url.substring(cxPrefix.length);
		ev.respondWith(handleCX(url));
	}
}
chrome.action.onClicked.addListener(handleClick);
addEventListener("fetch", handleFetch);
