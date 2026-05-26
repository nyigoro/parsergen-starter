const { io, Result, Option, __set, formatValue, LuminaPanic } = require("./lumina-runtime.cjs");
function main() {
  let int_val = identity_int(42);
  let str_val = identity_string("hello");
  let bool_val = identity_bool(true);
  let opt_int = wrap_int(10);
  let opt_str = wrap_string("hi");
  let got_int = unwrap_or_int(opt_int, 0);
  let got_str = unwrap_or_string(opt_str, "default");
  println(from_int(int_val));
  println(str_val);
  if (bool_val) {
    println("true");
  } else {
    println("false");
  }
  println(from_int(got_int));
  println(got_str);
}
function identity_int(x) {
  return x;
}
function identity_string(x) {
  return x;
}
function identity_bool(x) {
  return x;
}
function wrap_int(x) {
  return { tag: "Some", values: [x] };
}
function wrap_string(x) {
  return { tag: "Some", values: [x] };
}
function unwrap_or_int(opt, fallback) {
  let __match1 = opt;
  if ((__match1.tag == "Some")) {
    let val = __match1.values[0];
    return val;
  } else {
    if ((__match1.tag == "None")) {
      return fallback;
    }
  }
}
function unwrap_or_string(opt, fallback) {
  let __match2 = opt;
  if ((__match2.tag == "Some")) {
    let val = __match2.values[0];
    return val;
  } else {
    if ((__match2.tag == "None")) {
      return fallback;
    }
  }
}
module.exports = { io, Result, Option, __set, formatValue, LuminaPanic };
