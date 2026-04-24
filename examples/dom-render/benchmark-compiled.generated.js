import { io, str, math, list, vec, hashmap, hashset, deque, btreemap, btreeset, priority_queue, channel, async_channel, thread, sync, render, reactive, functor, applicative, monad, foldable, traversable, iter, map_vec, filter_vec, filter_option, zip_vec, enumerate_vec, flatten_vec, flat_map_vec, chunk_vec, window_vec, partition_vec, take_vec, skip_vec, any_vec, all_vec, find_vec, count_vec, sum_vec, sum_vec_f64, unique_vec, reverse_vec, sort_vec, sort_by_vec, sort_by_desc_vec, group_by_vec, intersperse_vec, join_vec, query, where_q, select_q, order_by_q, order_by_desc_q, limit_q, offset_q, group_by_q, count_q, first_q, to_vec_q, join_q, createSignal, get, set, createMemo, createEffect, vnode, text, liveText, indexList, forList, mount_reactive, createDomRenderer, props_empty, props_class, props_on_click, props_on_click_delta, props_on_click_inc, props_on_click_dec, props_merge, props_id, props_style, props_value, props_placeholder, props_href, props_disabled, props_on_input, props_on_change, props_key, dom_get_element_by_id, fs, opfs, url, router, web_storage, dom, web_worker, web_streams, path, env, process, json, http, time, join_all, timeout, sab_channel, webgpu, regex, crypto, Result, Option, __set, formatValue, __lumina_stringify, __lumina_range, __lumina_slice, __lumina_index, __lumina_fixed_array, __lumina_array_bounds_check, __lumina_array_literal, __lumina_clone, __lumina_debug, __lumina_eq, __lumina_struct, __lumina_register_trait_impl, LuminaPanic } from "./lumina-runtime.js";
const __lumina_static_render_0 = props_class("bench-list");
const __lumina_static_render_1 = props_class("bench-row");
const __lumina_static_render_3 = props_class("bench-pill");
const __lumina_static_render_4 = (() => { const __lumina_node = text("row"); __lumina_node.domTemplateHtml = "row"; return __lumina_node; })();
const __lumina_static_render_2 = (() => { const __lumina_node = vnode("span", __lumina_static_render_3, vec.from([__lumina_static_render_4])); __lumina_node.domTemplateHtml = "<span class=\"bench-pill\">row</span>"; return __lumina_node; })();
const __lumina_static_render_5 = props_class("bench-value");
class BenchRow {
  constructor(id, label) {
    this.id = id;
    this.label = label;
  }
}
function compiledWholeList(rows) {
  return vnode("ul", __lumina_static_render_0, vec.from([render.indexList(rows, function(__lumina_item, __lumina_index) {
  return (function(row, _index) {
  return vnode("li", __lumina_static_render_1, vec.from([__lumina_static_render_2, vnode("span", __lumina_static_render_5, vec.from([text(row)]))]));
})(get(__lumina_item), __lumina_index);
})]));
}
function compiledIndexList(rows) {
  return vnode("ul", __lumina_static_render_0, vec.from([indexList(rows, function(row, _index) {
  return vnode("li", __lumina_static_render_1, vec.from([__lumina_static_render_2, vnode("span", __lumina_static_render_5, vec.from([render.liveText(row)]))]));
})]));
}
function compiledReorder(rows) {
  return vnode("ul", __lumina_static_render_0, vec.from([render.forList(rows, function(row, _index) {
  return row.id;
}, function(__lumina_item, __lumina_index) {
  return (function(row, _index) {
  return vnode("li", props_key(row.id), vec.from([__lumina_static_render_2, vnode("span", __lumina_static_render_5, vec.from([text(row.label)]))]));
})(get(__lumina_item), get(__lumina_index));
})]));
}
function compiledForList(rows) {
  return vnode("ul", __lumina_static_render_0, vec.from([forList(rows, function(_row, index) {
  return index;
}, function(row, _index) {
  return vnode("li", __lumina_static_render_1, vec.from([__lumina_static_render_2, vnode("span", __lumina_static_render_5, vec.from([render.liveText(row)]))]));
})]));
}
export { io, str, math, list, vec, hashmap, hashset, deque, btreemap, btreeset, priority_queue, channel, async_channel, thread, sync, render, reactive, functor, applicative, monad, foldable, traversable, iter, map_vec, filter_vec, filter_option, zip_vec, enumerate_vec, flatten_vec, flat_map_vec, chunk_vec, window_vec, partition_vec, take_vec, skip_vec, any_vec, all_vec, find_vec, count_vec, sum_vec, sum_vec_f64, unique_vec, reverse_vec, sort_vec, sort_by_vec, sort_by_desc_vec, group_by_vec, intersperse_vec, join_vec, query, where_q, select_q, order_by_q, order_by_desc_q, limit_q, offset_q, group_by_q, count_q, first_q, to_vec_q, join_q, createSignal, get, set, createMemo, createEffect, vnode, text, liveText, indexList, forList, mount_reactive, createDomRenderer, props_empty, props_class, props_on_click, props_on_click_delta, props_on_click_inc, props_on_click_dec, props_merge, props_id, props_style, props_value, props_placeholder, props_href, props_disabled, props_on_input, props_on_change, props_key, dom_get_element_by_id, fs, opfs, url, web_storage, dom, web_worker, web_streams, path, env, process, json, http, time, join_all, timeout, sab_channel, webgpu, regex, crypto, Result, Option, __set, formatValue, __lumina_stringify, __lumina_range, __lumina_slice, __lumina_index, __lumina_fixed_array, __lumina_array_bounds_check, __lumina_array_literal, __lumina_clone, __lumina_debug, __lumina_eq, __lumina_struct, __lumina_register_trait_impl, LuminaPanic, compiledWholeList, compiledIndexList, compiledReorder, compiledForList };
