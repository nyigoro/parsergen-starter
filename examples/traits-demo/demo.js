import { io, str, math, list, vec, hashmap, hashset, fs, http, Result, Option, __set, formatValue, LuminaPanic } from "./lumina-runtime.js";
function Printable$User$print(self) {
  io.println(str.concat("User: ", self.name));
}
function Printable$User$debug(self) {
  return str.concat(str.concat("User { name: ", self.name), str.concat(", age: ", str.concat(str.from_int(self.age), " }")));
}
function Printable$Product$print(self) {
  io.println(str.concat("Product: ", self.name));
}
function Printable$Product$debug(self) {
  return str.concat(str.concat("Product { name: ", self.name), str.concat(", price: $", str.concat(str.from_int(self.price), " }")));
}
function main() {
  const user = { name: "Alice", age: 30 };
  Printable$User$print(user);
  io.println(Printable$User$debug(user));
  const product = { name: "Laptop", price: 1200 };
  Printable$Product$print(product);
  io.println(Printable$Product$debug(product));
}
main();
export { io, str, math, list, vec, hashmap, hashset, fs, http, Result, Option, __set, formatValue, LuminaPanic };
