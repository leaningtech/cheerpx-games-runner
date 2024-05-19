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
function handleFetch(ev)
{
	var url = ev.request.url;
	var proxyPrefix = chrome.runtime.getURL("@");
	if(url.startsWith(proxyPrefix))
	{
		url = url.substring(proxyPrefix.length);
		ev.respondWith(handleProxied(url));
	}
}
chrome.action.onClicked.addListener(handleClick);
addEventListener("fetch", handleFetch);
