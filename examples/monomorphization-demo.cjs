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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkM6XFxVc2Vyc1xcQWRtaW5pc3RyYXRvclxcbnlpZ29yb1xccGFyc2VyZ2VuLXN0YXJ0ZXJcXGV4YW1wbGVzXFxtb25vbW9ycGhpemF0aW9uLWRlbW8ubG0iXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQTJCTztBQUNELGdCQUFVLGFBQVM7QUFDbkIsZ0JBQVUsZ0JBQVM7QUFDbkIsaUJBQVcsY0FBUztBQUVwQixnQkFBVSxTQUFLO0FBQ2YsZ0JBQVUsWUFBSztBQUVmLGdCQUFVLGNBQVUsU0FBUztBQUM3QixnQkFBVSxpQkFBVSxTQUFTO0FBRWpDLEVBQUEsUUFBVyxTQUFhO0FBQ3hCLEVBQUEsUUFBVztBQUNYLE1BQUk7QUFDRixJQUFBLFFBQVc7QUFEYjtBQUdFLElBQUEsUUFBVztBQUNaO0FBQ0QsRUFBQSxRQUFXLFNBQWE7QUFDeEIsRUFBQSxRQUFXO0FBbkJGO0FBbkJSO0FBQ0QsU0FBTztBQURFO0FBQVI7QUFDRCxTQUFPO0FBREU7QUFBUjtBQUNELFNBQU87QUFERTtBQUlSO0FBQ0QsU0FBTyx3QkFBWTtBQURkO0FBQUo7QUFDRCxTQUFPLHdCQUFZO0FBRGQ7QUFJSjtBQUNELGlCQUFNOzs7QUFFRixXQUFPOzs7QUFHUCxhQUFPOzs7QUFORDtBQUFUO0FBQ0QsaUJBQU07OztBQUVGLFdBQU87OztBQUdQLGFBQU87OztBQU5EIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgaW8sIHN0ciB9IGZyb20gXCJAc3RkXCJcblxuLy8gTG9jYWwgT3B0aW9uIHR5cGUgdG8ga2VlcCB0aGUgZGVtbyBzZWxmLWNvbnRhaW5lZFxucHViIGVudW0gT3B0aW9uPFQ+IHtcbiAgU29tZShUKSxcbiAgTm9uZVxufVxuXG5mbiBpZGVudGl0eTxUPih4OiBUKSAtPiBUIHtcbiAgcmV0dXJuIHg7XG59XG5cbmZuIHdyYXA8VD4oeDogVCkgLT4gT3B0aW9uPFQ+IHtcbiAgcmV0dXJuIE9wdGlvbi5Tb21lKHgpO1xufVxuXG5mbiB1bndyYXBfb3I8VD4ob3B0OiBPcHRpb248VD4sIGZhbGxiYWNrOiBUKSAtPiBUIHtcbiAgbWF0Y2ggb3B0IHtcbiAgICBPcHRpb24uU29tZSh2YWwpID0+IHtcbiAgICAgIHJldHVybiB2YWw7XG4gICAgfSxcbiAgICBPcHRpb24uTm9uZSA9PiB7XG4gICAgICByZXR1cm4gZmFsbGJhY2s7XG4gICAgfVxuICB9XG59XG5cbnB1YiBmbiBtYWluKCkge1xuICBsZXQgaW50X3ZhbCA9IGlkZW50aXR5KDQyKTtcbiAgbGV0IHN0cl92YWwgPSBpZGVudGl0eShcImhlbGxvXCIpO1xuICBsZXQgYm9vbF92YWwgPSBpZGVudGl0eSh0cnVlKTtcblxuICBsZXQgb3B0X2ludCA9IHdyYXAoMTApO1xuICBsZXQgb3B0X3N0ciA9IHdyYXAoXCJoaVwiKTtcblxuICBsZXQgZ290X2ludCA9IHVud3JhcF9vcihvcHRfaW50LCAwKTtcbiAgbGV0IGdvdF9zdHIgPSB1bndyYXBfb3Iob3B0X3N0ciwgXCJkZWZhdWx0XCIpO1xuXG4gIGlvLnByaW50bG4oc3RyLmZyb21faW50KGludF92YWwpKTtcbiAgaW8ucHJpbnRsbihzdHJfdmFsKTtcbiAgaWYgKGJvb2xfdmFsKSB7XG4gICAgaW8ucHJpbnRsbihcInRydWVcIik7XG4gIH0gZWxzZSB7XG4gICAgaW8ucHJpbnRsbihcImZhbHNlXCIpO1xuICB9XG4gIGlvLnByaW50bG4oc3RyLmZyb21faW50KGdvdF9pbnQpKTtcbiAgaW8ucHJpbnRsbihnb3Rfc3RyKTtcbn1cclxuIl19
