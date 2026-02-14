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
  await http.fetch(req);
}
function none_string() {
  { $tag: "None" };
}
function none_headers() {
  { $tag: "None" };
}
function make_request(url, method, body) {
  { url: url, method: method, headers: none_headers(), body: body };
}
async function get(url) {
  request(make_request(url, "GET", none_string()));
}
async function post(url, body) {
  request(make_request(url, "POST", { $tag: "Some", $payload: body }));
}
async function put(url, body) {
  request(make_request(url, "PUT", { $tag: "Some", $payload: body }));
}
async function delete(url) {
  request(make_request(url, "DELETE", none_string()));
}
export { io, str, math, list, fs, http, Result, Option, __set, formatValue, LuminaPanic };
