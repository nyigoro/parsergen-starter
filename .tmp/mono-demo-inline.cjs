const { io, str, math, list, vec, hashmap, hashset, deque, btreemap, btreeset, priority_queue, channel, async_channel, thread, sync, render, reactive, createSignal, get, set, createMemo, createEffect, vnode, text, mount_reactive, createDomRenderer, props_empty, props_class, props_on_click, props_on_click_delta, props_on_click_inc, props_on_click_dec, props_merge, dom_get_element_by_id, fs, path, env, process, json, http, time, join_all, timeout, regex, crypto, Result, Option, __set, formatValue, __lumina_stringify, __lumina_range, __lumina_slice, __lumina_index, __lumina_clone, __lumina_debug, __lumina_eq, __lumina_struct, __lumina_register_trait_impl, LuminaPanic } = require("./lumina-runtime.cjs");
function main() {
  let opt_int = { tag: "Some", values: [10] };
  let opt_str = { tag: "Some", values: ["hi"] };
  let got_int = unwrap_or_i32(opt_int, 0);
  let got_str = unwrap_or_string(opt_str, "default");
  io.println(str.from_int(42));
  io.println("hello");
  io.println("true");
  io.println(str.from_int(got_int));
  io.println(got_str);
}
function unwrap_or_i32(opt, fallback) {
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
module.exports = { io, str, math, list, vec, hashmap, hashset, deque, btreemap, btreeset, priority_queue, channel, async_channel, thread, sync, render, reactive, createSignal, get, set, createMemo, createEffect, vnode, text, mount_reactive, createDomRenderer, props_empty, props_class, props_on_click, props_on_click_delta, props_on_click_inc, props_on_click_dec, props_merge, dom_get_element_by_id, fs, path, env, process, json, http, time, join_all, timeout, regex, crypto, Result, Option, __set, formatValue, __lumina_stringify, __lumina_range, __lumina_slice, __lumina_index, __lumina_clone, __lumina_debug, __lumina_eq, __lumina_struct, __lumina_register_trait_impl, LuminaPanic };
