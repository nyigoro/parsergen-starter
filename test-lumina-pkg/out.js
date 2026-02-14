import { io, str, math, list, fs, Result, Option, __set, formatValue, LuminaPanic } from "./lumina-runtime.js";
function greet(name) {
  str.concat("Hello, ", name);
}
function add(a, b) {
  (a + b);
}
function main() {
  io.println(greet("World"));
  io.println(str.from_int(add(2, 3)));
}
export { io, str, math, list, fs, Result, Option, __set, formatValue, LuminaPanic };
