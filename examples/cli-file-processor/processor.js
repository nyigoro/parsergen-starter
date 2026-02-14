import { io, str, math, list, fs, Result, Option, __set, formatValue, LuminaPanic } from "./lumina-runtime.js";
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
async function process_file(path) {
  const __match_val_0 = await fs.readFile(path);
  switch (__match_val_0.$tag) {
    case "Ok": {
      const content = __match_val_0.$payload;
      const lines = str.split(content, "\n");
      const line_count = list.length(lines);
      const char_count = str.length(content);
      io.println(str.concat("Lines: ", str.from_int(line_count)));
      io.println(str.concat("Chars: ", str.from_int(char_count)));
      break;
    }
    case "Err": {
      const error = __match_val_0.$payload;
      const message = error;
      io.eprintln(str.concat("Read error: ", message));
      break;
    }
    default: {
      throw new Error("Exhaustiveness failure");
    }
  }
}
async function main() {
  io.println("Lumina File Processor");
  io.println("Enter a file path:");
  const __match_val_1 = await io.readLineAsync();
  switch (__match_val_1.$tag) {
    case "Some": {
      const path = __match_val_1.$payload;
      if (str.eq(str.trim(path), "")) {
        io.eprintln("No path provided.");
      } else {
        await process_file(path);
      }
      break;
    }
    case "None": {
      io.eprintln("No input available.");
      break;
    }
    default: {
      throw new Error("Exhaustiveness failure");
    }
  }
}
main();
export { io, str, math, list, fs, Result, Option, __set, formatValue, LuminaPanic };
