import { io, str, math, list, vec, hashmap, hashset, deque, btreemap, btreeset, priority_queue, channel, async_channel, thread, sync, render, reactive, functor, applicative, monad, foldable, traversable, iter, map_vec, filter_vec, filter_option, zip_vec, enumerate_vec, flatten_vec, flat_map_vec, chunk_vec, window_vec, partition_vec, take_vec, skip_vec, any_vec, all_vec, find_vec, count_vec, sum_vec, sum_vec_f64, unique_vec, reverse_vec, sort_vec, sort_by_vec, sort_by_desc_vec, group_by_vec, intersperse_vec, join_vec, query, where_q, select_q, order_by_q, order_by_desc_q, limit_q, offset_q, group_by_q, count_q, first_q, to_vec_q, join_q, createSignal, get, set, createMemo, createEffect, vnode, text, mount_reactive, createDomRenderer, props_empty, props_class, props_on_click, props_on_click_delta, props_on_click_inc, props_on_click_dec, props_merge, props_id, props_style, props_value, props_placeholder, props_href, props_disabled, props_on_input, props_on_change, props_key, dom_get_element_by_id, fs, opfs, url, router, web_storage, dom, web_worker, web_streams, path, env, process, json, http, time, join_all, timeout, sab_channel, webgpu, regex, crypto, Result, Option, __set, formatValue, __lumina_stringify, __lumina_range, __lumina_slice, __lumina_index, __lumina_fixed_array, __lumina_array_bounds_check, __lumina_array_literal, __lumina_clone, __lumina_debug, __lumina_eq, __lumina_struct, __lumina_register_trait_impl, LuminaPanic } from "./lumina-runtime.js";
function __lumina_bundle_0_button(props, children) {
  return vnode("button", props_merge(props_class("inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-400"), props), children);
}
function __lumina_bundle_0_input(props) {
  return vnode("input", props_merge(props_class("w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"), props), vec.from([]));
}
function __lumina_bundle_0_card(props, children) {
  return vnode("div", props_merge(props_class("rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-xl shadow-slate-200/60 backdrop-blur"), props), children);
}
function __lumina_bundle_0_tabsListStyled(props, renderChildren) {
  return tabsList(props_merge(props_class("inline-flex rounded-2xl bg-slate-100 p-1"), props), renderChildren);
}
function __lumina_bundle_0_tabsTriggerStyled(value, props, children) {
  return tabsTrigger(value, props_merge(props_class("rounded-xl px-4 py-2 text-sm font-medium text-slate-600 transition data-[state=active]:bg-white data-[state=active]:text-slate-950 data-[state=active]:shadow-sm"), props), children);
}
function __lumina_bundle_0_tabsPanelStyled(value, props, children) {
  return tabsPanel(value, props_merge(props_class("rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"), props), children);
}
function __lumina_bundle_0_dialogOverlayStyled(props) {
  return dialogOverlay(props_merge(props_class("fixed inset-0 bg-slate-950/55 backdrop-blur-sm"), props));
}
function __lumina_bundle_0_dialogContentStyled(props, children) {
  return dialogContent(props_merge(props_class("fixed left-1/2 top-1/2 w-[min(92vw,34rem)] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl shadow-slate-950/20"), props), children);
}
function __lumina_bundle_0_toastContentStyled(props, children) {
  return toastContent(props_merge(props_class("fixed bottom-6 right-6 w-[min(92vw,24rem)] rounded-2xl bg-slate-950 px-4 py-3 text-white shadow-2xl"), props), children);
}
function __lumina_bundle_0_presenceCard(open, props, children) {
  return transitionPresence(open, props_merge(props_class("will-change-transform transition duration-200 ease-out data-[transition-state=enter-from]:translate-y-2 data-[transition-state=enter-from]:opacity-0 data-[transition-state=enter-to]:translate-y-0 data-[transition-state=enter-to]:opacity-100 data-[transition-state=exit-from]:translate-y-0 data-[transition-state=exit-from]:opacity-100 data-[transition-state=exit-to]:translate-y-2 data-[transition-state=exit-to]:opacity-0"), props), 180, function() {
  return children;
});
}
function app() {
  const active = render.state("overview");
  const open = render.state(true);
  const toggle = __lumina_bundle_0_button(render.props_on_click(function() {
  if ((render.get(open) == false)) {
    const _ = render.set(open, true);
  } else {
    const _ = render.set(open, false);
  }
}), vec.from([render.text("Toggle insight")]));
  return __lumina_bundle_0_card(render.props_class("mx-auto mt-12 flex w-[min(92vw,60rem)] flex-col gap-6"), vec.from([render.element("div", 0, vec.from([render.element("p", render.props_class("text-sm font-semibold uppercase tracking-[0.28em] text-sky-600"), vec.from([render.text("LUMINA UI")])), render.element("h1", render.props_class("mt-3 text-5xl font-semibold tracking-tight text-slate-950"), vec.from([render.text("Styled headless workspace")])), render.element("p", render.props_class("mt-3 max-w-2xl text-lg text-slate-600"), vec.from([render.text("The ui layer wraps the headless runtime with Tailwind-style defaults and transition-aware surfaces.")]))])), toggle, render.tabsRoot(active, function() {
  return vec.from([__lumina_bundle_0_tabsListStyled(render.props_class("mb-2"), function() {
  return vec.from([__lumina_bundle_0_tabsTriggerStyled("overview", 0, vec.from([render.text("Overview")])), __lumina_bundle_0_tabsTriggerStyled("activity", 0, vec.from([render.text("Activity")]))]);
}), __lumina_bundle_0_tabsPanelStyled("overview", 0, vec.from([__lumina_bundle_0_presenceCard(open, render.props_class("rounded-2xl bg-sky-50 p-5 text-slate-700"), vec.from([render.text("Transitions, styling, and keyed UI composition now ship together.")]))])), __lumina_bundle_0_tabsPanelStyled("activity", 0, vec.from([render.text("Use this example as a starting point for styled Lumina UI apps.")]))]);
})]));
}
function main() {
  const container = render.dom_get_element_by_id("root");
  const renderer = render.createDomRenderer();
  const _mounted = render.mount_reactive(renderer, container, function() {
  return app();
});
}
main();
export { io, str, math, list, vec, hashmap, hashset, deque, btreemap, btreeset, priority_queue, channel, async_channel, thread, sync, render, reactive, functor, applicative, monad, foldable, traversable, iter, map_vec, filter_vec, filter_option, zip_vec, enumerate_vec, flatten_vec, flat_map_vec, chunk_vec, window_vec, partition_vec, take_vec, skip_vec, any_vec, all_vec, find_vec, count_vec, sum_vec, sum_vec_f64, unique_vec, reverse_vec, sort_vec, sort_by_vec, sort_by_desc_vec, group_by_vec, intersperse_vec, join_vec, query, where_q, select_q, order_by_q, order_by_desc_q, limit_q, offset_q, group_by_q, count_q, first_q, to_vec_q, join_q, createSignal, get, set, createMemo, createEffect, vnode, text, mount_reactive, createDomRenderer, props_empty, props_class, props_on_click, props_on_click_delta, props_on_click_inc, props_on_click_dec, props_merge, props_id, props_style, props_value, props_placeholder, props_href, props_disabled, props_on_input, props_on_change, props_key, dom_get_element_by_id, fs, opfs, url, web_storage, dom, web_worker, web_streams, path, env, process, json, http, time, join_all, timeout, sab_channel, webgpu, regex, crypto, Result, Option, __set, formatValue, __lumina_stringify, __lumina_range, __lumina_slice, __lumina_index, __lumina_fixed_array, __lumina_array_bounds_check, __lumina_array_literal, __lumina_clone, __lumina_debug, __lumina_eq, __lumina_struct, __lumina_register_trait_impl, LuminaPanic };
