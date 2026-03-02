import { io, str, math, list, vec, hashmap, hashset, deque, btreemap, btreeset, priority_queue, channel, async_channel, thread, sync, render, reactive, createSignal, get, set, createMemo, createEffect, vnode, text, mount_reactive, createDomRenderer, fs, path, env, process, json, http, time, join_all, timeout, regex, crypto, Result, Option, __set, formatValue, __lumina_stringify, __lumina_range, __lumina_slice, __lumina_index, __lumina_fixed_array, __lumina_array_bounds_check, __lumina_array_literal, __lumina_clone, __lumina_debug, __lumina_eq, __lumina_struct, __lumina_register_trait_impl, LuminaPanic } from "./lumina-runtime.js";
function counterView(count) {
  return vnode("div", props_class("counter"), vec.from([vnode("h1", props_empty(), vec.from([text("Counter Example")])), vnode("div", props_class("row"), vec.from([vnode("button", props_on_click_delta(count, (0 - 1)), vec.from([text("-")])), vnode("span", props_class("count"), vec.from([text(get(count))])), vnode("button", props_on_click_delta(count, 1), vec.from([text("+")]))]))]));
}
function main() {
  const container = dom_get_element_by_id("app");
  const renderer = createDomRenderer();
  const count = createSignal(0);
  const _mounted = mount_reactive(renderer, container, function() {
  return counterView(count);
});
}
main();
export { io, str, math, list, vec, hashmap, hashset, deque, btreemap, btreeset, priority_queue, channel, async_channel, thread, sync, render, reactive, createSignal, get, set, createMemo, createEffect, vnode, text, mount_reactive, createDomRenderer, fs, path, env, process, json, http, time, join_all, timeout, regex, crypto, Result, Option, __set, formatValue, __lumina_stringify, __lumina_range, __lumina_slice, __lumina_index, __lumina_fixed_array, __lumina_array_bounds_check, __lumina_array_literal, __lumina_clone, __lumina_debug, __lumina_eq, __lumina_struct, __lumina_register_trait_impl, LuminaPanic };
