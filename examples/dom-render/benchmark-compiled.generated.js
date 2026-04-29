import { render, get, vnode, text, props_class, props_key } from "./lumina-runtime.js?v=2026-04-29-benchmark-quality-v3";

const BENCH_LIST_PROPS = props_class("bench-list");
const BENCH_ROW_PROPS = props_class("bench-row");
const BENCH_PILL_PROPS = props_class("bench-pill");
const BENCH_VALUE_PROPS = props_class("bench-value");

const renderBenchRow = (content, props = BENCH_ROW_PROPS) =>
  vnode("li", props, [
    vnode("span", BENCH_PILL_PROPS, [text("row")]),
    vnode("span", BENCH_VALUE_PROPS, [content]),
  ]);

function compiledIndexList(rows) {
  return vnode("ul", BENCH_LIST_PROPS, [
    render.indexList(rows, (row) => renderBenchRow(render.liveText(row))),
  ]);
}

function compiledReorder(rows) {
  return vnode("ul", BENCH_LIST_PROPS, [
    render.forList(
      rows,
      (row) => row.id,
      (row) =>
        renderBenchRow(
          render.liveText(render.memo(() => get(row).label)),
          props_key(get(row).id)
        )
    ),
  ]);
}

function compiledForList(rows) {
  return vnode("ul", BENCH_LIST_PROPS, [
    render.forList(rows, (_row, index) => index, (row) => renderBenchRow(render.liveText(row))),
  ]);
}

export { compiledIndexList, compiledReorder, compiledForList };
