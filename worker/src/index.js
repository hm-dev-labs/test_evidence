export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    let key = url.pathname.replace(/^\/+/, ""); // 先頭の / を除去

    // ルートやディレクトリパスは index.html を返す
    if (key === "" || key.endsWith("/")) {
      key += "index.html";
    }

    let object = await env.ASSETS.get(key);

    // 該当ファイルがなければ 404.html を試す
    if (object === null) {
      object = await env.ASSETS.get("404.html");
      if (object === null) {
        return new Response("Not Found", { status: 404 });
      }
      const headers = new Headers();
      headers.set("content-type", "text/html; charset=utf-8");
      return new Response(object.body, { status: 404, headers });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers); // R2アップロード時のContent-Type等を反映
    headers.set("etag", object.httpEtag);
    if (!headers.has("content-type")) {
      headers.set("content-type", guessContentType(key));
    }

    return new Response(object.body, { headers });
  },
};

function guessContentType(key) {
  const ext = key.split(".").pop();
  const map = {
    html: "text/html; charset=utf-8",
    css: "text/css",
    js: "application/javascript",
    json: "application/json",
    wasm: "application/wasm",
    svg: "image/svg+xml",
    png: "image/png",
    jpg: "image/jpeg",
    parquet: "application/octet-stream",
  };
  return map[ext] ?? "application/octet-stream";
}
