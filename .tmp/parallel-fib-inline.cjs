const { io, str, math, list, vec, hashmap, hashset, deque, btreemap, btreeset, priority_queue, channel, async_channel, thread, sync, render, reactive, functor, applicative, monad, foldable, traversable, createSignal, get, set, createMemo, createEffect, vnode, text, mount_reactive, createDomRenderer, props_empty, props_class, props_on_click, props_on_click_delta, props_on_click_inc, props_on_click_dec, props_merge, dom_get_element_by_id, fs, path, env, process, json, http, time, join_all, timeout, regex, crypto, Result, Option, __set, formatValue, __lumina_stringify, __lumina_range, __lumina_slice, __lumina_index, __lumina_fixed_array, __lumina_array_bounds_check, __lumina_array_literal, __lumina_clone, __lumina_debug, __lumina_eq, __lumina_struct, __lumina_register_trait_impl, LuminaPanic } = require("./lumina-runtime.cjs");
function fib(n) {
  if ((n <= 1)) {
    n;
  } else {
    (fib((n - 1)) + fib((n - 2)));
  }
}
async function main() {
  const n0 = 10;
  const n1 = 11;
  const n2 = 12;
  const n3 = 13;
  const h0 = thread.spawn(function() {
  return fib(n0);
});
  const h1 = thread.spawn(function() {
  return fib(n1);
});
  const h2 = thread.spawn(function() {
  return fib(n2);
});
  const h3 = thread.spawn(function() {
  return fib(n3);
});
  const r0 = await h0.join();
  const r1 = await h1.join();
  const r2 = await h2.join();
  const r3 = await h3.join();
  const v0 = { $tag: "unwrap_or", $payload: [0, r0] };
  const v1 = { $tag: "unwrap_or", $payload: [0, r1] };
  const v2 = { $tag: "unwrap_or", $payload: [0, r2] };
  const v3 = { $tag: "unwrap_or", $payload: [0, r3] };
  const total = (((v0 + v1) + v2) + v3);
  io.println(str.concat("parallel fib total: ", str.from_int(total)));
  total;
}
module.exports = { io, str, math, list, vec, hashmap, hashset, deque, btreemap, btreeset, priority_queue, channel, async_channel, thread, sync, render, reactive, functor, applicative, monad, foldable, traversable, createSignal, get, set, createMemo, createEffect, vnode, text, mount_reactive, createDomRenderer, props_empty, props_class, props_on_click, props_on_click_delta, props_on_click_inc, props_on_click_dec, props_merge, dom_get_element_by_id, fs, path, env, process, json, http, time, join_all, timeout, regex, crypto, Result, Option, __set, formatValue, __lumina_stringify, __lumina_range, __lumina_slice, __lumina_index, __lumina_fixed_array, __lumina_array_bounds_check, __lumina_array_literal, __lumina_clone, __lumina_debug, __lumina_eq, __lumina_struct, __lumina_register_trait_impl, LuminaPanic };
