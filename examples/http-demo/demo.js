import { io, str, math, list, fs, http, Result, Option, __set, formatValue, LuminaPanic } from "./lumina-runtime.js";
function print(message) {
}
function abs(value) {
}
function max(a, b) {
}
function min(a, b) {
}
function len(value) {
}
function upper(value) {
}
async function request(req) {
  return await http.fetch(req);
}
function none_string() {
  { $tag: "None" };
}
function none_headers() {
  { $tag: "None" };
}
function make_request(url, method, body) {
  return { url: url, method: method, headers: none_headers(), body: body };
}
async function get(url) {
  return await request(make_request(url, "GET", none_string()));
}
async function post(url, body) {
  return await request(make_request(url, "POST", { $tag: "Some", $payload: body }));
}
async function put(url, body) {
  return await request(make_request(url, "PUT", { $tag: "Some", $payload: body }));
}
async function del(url) {
  return await request(make_request(url, "DELETE", none_string()));
}
async function main() {
  io.println("Fetching GitHub API...");
  const __match_val_0 = await get("https://api.github.com/users/octocat");
  switch (__match_val_0.$tag) {
    case "Ok": {
      const response = __match_val_0.$payload;
      io.println(str.concat("Status: ", str.from_int(response.status)));
      io.println(str.concat("Body length: ", str.from_int(str.length(response.body))));
      io.println("");
      io.println("First 200 chars:");
      io.println(str.substring(response.body, 0, 200));
      break;
    }
    case "Err": {
      const error = __match_val_0.$payload;
      io.eprintln(str.concat("Error: ", error));
      break;
    }
    default: {
      throw new Error("Exhaustiveness failure");
    }
  }
}
main();
export { io, str, math, list, fs, http, Result, Option, __set, formatValue, LuminaPanic };
